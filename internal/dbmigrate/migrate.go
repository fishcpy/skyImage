package dbmigrate

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"sync"

	"gorm.io/gorm"

	"skyimage/internal/config"
	"skyimage/internal/data"
)

const defaultBatchSize = 200

var migrateMu sync.Mutex

// Options controls cross-database migration behavior.
type Options struct {
	// TruncateTarget removes existing rows from each target table before copy.
	// Required when the destination is not empty.
	TruncateTarget bool
	// SwitchRuntime updates .env and calls OnSwitched after a successful migrate.
	SwitchRuntime bool
	// BatchSize is rows per batch (default 200).
	BatchSize int
	// OnProgress is optional progress callback (table, done, total).
	OnProgress func(table string, done, total int64)
	// OnSwitched is called after config is saved when SwitchRuntime is true.
	OnSwitched func(cfg config.Config, db *gorm.DB)
}

// TableResult reports how many rows were copied for one table.
type TableResult struct {
	Table      string `json:"table"`
	SourceRows int64  `json:"sourceRows"`
	CopiedRows int64  `json:"copiedRows"`
	TargetRows int64  `json:"targetRows"`
	// Rows is kept for backward-compatible clients (same as CopiedRows).
	Rows int64 `json:"rows"`
}

// Result is the outcome of a migration run.
type Result struct {
	SourceType string        `json:"sourceType"`
	TargetType string        `json:"targetType"`
	Tables     []TableResult `json:"tables"`
	Switched   bool          `json:"switched"`
}

// TestConnection opens the database and pings it.
func TestConnection(cfg config.Config) error {
	if err := data.ValidateDatabaseConfig(cfg); err != nil {
		return err
	}
	db, err := data.OpenDatabase(cfg)
	if err != nil {
		return err
	}
	defer closeDB(db)
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Ping()
}

// Migrate copies all application tables from source to target.
// Only one migration may run at a time in this process.
func Migrate(ctx context.Context, sourceCfg, targetCfg config.Config, opts Options) (Result, error) {
	if !migrateMu.TryLock() {
		return Result{}, fmt.Errorf("another database migration is already running")
	}
	defer migrateMu.Unlock()

	if err := data.ValidateDatabaseConfig(sourceCfg); err != nil {
		return Result{}, fmt.Errorf("source: %w", err)
	}
	if err := data.ValidateDatabaseConfig(targetCfg); err != nil {
		return Result{}, fmt.Errorf("target: %w", err)
	}
	if databaseConfigEqual(sourceCfg, targetCfg) {
		return Result{}, fmt.Errorf("source and target database configuration are identical")
	}

	batchSize := opts.BatchSize
	if batchSize <= 0 {
		batchSize = defaultBatchSize
	}

	sourceDB, err := data.OpenDatabase(sourceCfg)
	if err != nil {
		return Result{}, fmt.Errorf("open source: %w", err)
	}
	defer closeDB(sourceDB)

	targetDB, err := data.OpenDatabase(targetCfg)
	if err != nil {
		return Result{}, fmt.Errorf("open target: %w", err)
	}
	// Only close target if we are not switching runtime to it.
	closeTarget := true
	defer func() {
		if closeTarget {
			closeDB(targetDB)
		}
	}()

	if err := data.PrepareSchema(targetDB); err != nil {
		return Result{}, fmt.Errorf("prepare target schema: %w", err)
	}

	tables := data.MigrateTables()
	results := make([]TableResult, 0, len(tables))

	if !opts.TruncateTarget {
		nonEmpty, err := listNonEmptyTables(ctx, targetDB, tables)
		if err != nil {
			return Result{}, err
		}
		if len(nonEmpty) > 0 {
			return Result{}, fmt.Errorf(
				"target database is not empty (%s); enable truncateTarget to clear target tables first",
				strings.Join(nonEmpty, ", "),
			)
		}
	} else {
		if err := truncateAll(ctx, targetDB, tables); err != nil {
			return Result{}, err
		}
	}

	for _, table := range tables {
		if err := ctx.Err(); err != nil {
			return Result{}, fmt.Errorf("migration cancelled (target may be partially written): %w", err)
		}
		tr, err := copyTable(ctx, sourceDB, targetDB, table, batchSize, opts.OnProgress)
		if err != nil {
			return Result{}, fmt.Errorf("copy %s (target may be partially written): %w", table.Name, err)
		}
		results = append(results, tr)
	}

	if err := verifyRowCounts(ctx, sourceDB, targetDB, results); err != nil {
		return Result{}, fmt.Errorf("row count mismatch (target may be partially written): %w", err)
	}

	if err := resetPostgresSequences(targetDB); err != nil {
		return Result{}, fmt.Errorf("reset sequences: %w", err)
	}

	switched := false
	if opts.SwitchRuntime {
		if err := config.SaveDatabaseEnv(targetCfg); err != nil {
			return Result{}, fmt.Errorf("save database config: %w", err)
		}
		switched = true
		closeTarget = false
		if opts.OnSwitched != nil {
			opts.OnSwitched(targetCfg, targetDB)
		}
	}

	return Result{
		SourceType: data.DialectorType(sourceCfg),
		TargetType: data.DialectorType(targetCfg),
		Tables:     results,
		Switched:   switched,
	}, nil
}

func copyTable(
	ctx context.Context,
	source, target *gorm.DB,
	table data.MigrateTable,
	batchSize int,
	onProgress func(table string, done, total int64),
) (TableResult, error) {
	result := TableResult{Table: table.Name}
	if !source.Migrator().HasTable(table.Name) {
		return result, nil
	}

	modelType := reflect.TypeOf(table.Model)
	if modelType.Kind() == reflect.Ptr {
		modelType = modelType.Elem()
	}

	var total int64
	if err := source.WithContext(ctx).Table(table.Name).Count(&total).Error; err != nil {
		return result, err
	}
	result.SourceRows = total
	if total == 0 {
		if onProgress != nil {
			onProgress(table.Name, 0, 0)
		}
		return result, nil
	}

	var done int64
	offset := 0
	for {
		if err := ctx.Err(); err != nil {
			result.CopiedRows = done
			result.Rows = done
			return result, err
		}
		slicePtr := reflect.New(reflect.SliceOf(modelType))
		if err := source.WithContext(ctx).
			Table(table.Name).
			Order(primaryOrder(table.Name)).
			Offset(offset).
			Limit(batchSize).
			Find(slicePtr.Interface()).Error; err != nil {
			result.CopiedRows = done
			result.Rows = done
			return result, err
		}
		sliceVal := slicePtr.Elem()
		if sliceVal.Len() == 0 {
			break
		}

		// Fail on conflict instead of silently skipping rows.
		if err := target.WithContext(ctx).
			Session(&gorm.Session{SkipHooks: true}).
			Create(sliceVal.Interface()).Error; err != nil {
			result.CopiedRows = done
			result.Rows = done
			return result, err
		}

		n := int64(sliceVal.Len())
		done += n
		offset += sliceVal.Len()
		if onProgress != nil {
			onProgress(table.Name, done, total)
		}
		if sliceVal.Len() < batchSize {
			break
		}
	}

	result.CopiedRows = done
	result.Rows = done
	if done != total {
		return result, fmt.Errorf("copied %d of %d rows", done, total)
	}
	return result, nil
}

func verifyRowCounts(ctx context.Context, source, target *gorm.DB, results []TableResult) error {
	for i := range results {
		name := results[i].Table
		var sourceCount, targetCount int64
		if source.Migrator().HasTable(name) {
			if err := source.WithContext(ctx).Table(name).Count(&sourceCount).Error; err != nil {
				return fmt.Errorf("%s source count: %w", name, err)
			}
		}
		if target.Migrator().HasTable(name) {
			if err := target.WithContext(ctx).Table(name).Count(&targetCount).Error; err != nil {
				return fmt.Errorf("%s target count: %w", name, err)
			}
		}
		results[i].SourceRows = sourceCount
		results[i].TargetRows = targetCount
		if sourceCount != targetCount {
			return fmt.Errorf("%s: source=%d target=%d", name, sourceCount, targetCount)
		}
	}
	return nil
}

func listNonEmptyTables(ctx context.Context, db *gorm.DB, tables []data.MigrateTable) ([]string, error) {
	var nonEmpty []string
	for _, table := range tables {
		if !db.Migrator().HasTable(table.Name) {
			continue
		}
		var count int64
		if err := db.WithContext(ctx).Table(table.Name).Count(&count).Error; err != nil {
			return nil, fmt.Errorf("count %s: %w", table.Name, err)
		}
		if count > 0 {
			nonEmpty = append(nonEmpty, fmt.Sprintf("%s=%d", table.Name, count))
		}
	}
	return nonEmpty, nil
}

func primaryOrder(table string) string {
	switch table {
	case "configs":
		return "key ASC"
	case "group_strategy":
		return "group_id ASC, strategy_id ASC"
	case "oauth_states", "sessions":
		return "id ASC"
	default:
		return "id ASC"
	}
}

func truncateAll(ctx context.Context, db *gorm.DB, tables []data.MigrateTable) error {
	// Reverse order for safer deletes under FK constraints.
	for i := len(tables) - 1; i >= 0; i-- {
		name := tables[i].Name
		if !db.Migrator().HasTable(name) {
			continue
		}
		if err := db.WithContext(ctx).Exec("DELETE FROM " + quoteTable(db, name)).Error; err != nil {
			return fmt.Errorf("truncate %s: %w", name, err)
		}
	}
	return nil
}

func quoteTable(db *gorm.DB, name string) string {
	d := ""
	if db.Dialector != nil {
		d = strings.ToLower(db.Dialector.Name())
	}
	switch d {
	case "postgres":
		return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
	default:
		return "`" + strings.ReplaceAll(name, "`", "``") + "`"
	}
}

func resetPostgresSequences(db *gorm.DB) error {
	if db.Dialector == nil || strings.ToLower(db.Dialector.Name()) != "postgres" {
		return nil
	}
	// Reset serial/identity sequences to MAX(id) for tables with numeric PKs.
	seqTables := []string{
		"groups", "strategies", "users", "user_oauth_bindings", "user_notifications",
		"files", "audit_profiles", "installer_states", "api_tokens", "albums",
		"redeem_codes", "redeem_code_usages",
	}
	for _, table := range seqTables {
		if !db.Migrator().HasTable(table) {
			continue
		}
		sql := fmt.Sprintf(
			`SELECT setval(pg_get_serial_sequence('%s', 'id'), COALESCE((SELECT MAX(id) FROM %s), 1), true)`,
			table, quoteTable(db, table),
		)
		// pg_get_serial_sequence may return NULL for tables without serial; ignore errors.
		_ = db.Exec(sql).Error
	}
	return nil
}

func closeDB(db *gorm.DB) {
	if db == nil {
		return
	}
	if sqlDB, err := db.DB(); err == nil {
		_ = sqlDB.Close()
	}
}

func databaseConfigEqual(a, b config.Config) bool {
	return strings.EqualFold(strings.TrimSpace(data.DialectorType(a)), strings.TrimSpace(data.DialectorType(b))) &&
		strings.TrimSpace(a.DatabaseHost) == strings.TrimSpace(b.DatabaseHost) &&
		strings.TrimSpace(a.DatabasePort) == strings.TrimSpace(b.DatabasePort) &&
		strings.TrimSpace(a.DatabaseName) == strings.TrimSpace(b.DatabaseName) &&
		strings.TrimSpace(a.DatabaseUser) == strings.TrimSpace(b.DatabaseUser) &&
		strings.TrimSpace(a.DatabasePassword) == strings.TrimSpace(b.DatabasePassword) &&
		cleanPath(a.DatabasePath) == cleanPath(b.DatabasePath)
}

func cleanPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	return strings.ReplaceAll(filepathToSlash(p), "\\", "/")
}

func filepathToSlash(p string) string {
	return strings.ReplaceAll(p, "\\", "/")
}
