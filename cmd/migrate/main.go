package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"skyimage/internal/config"
	"skyimage/internal/data"
	"skyimage/internal/dbmigrate"
)

func main() {
	var (
		sourceType = flag.String("source-type", "", "source database type (sqlite|mysql|postgres); default: current .env")
		sourcePath = flag.String("source-path", "", "source sqlite path")
		sourceHost = flag.String("source-host", "", "source host")
		sourcePort = flag.String("source-port", "", "source port")
		sourceName = flag.String("source-name", "", "source database name")
		sourceUser = flag.String("source-user", "", "source user")
		sourcePass = flag.String("source-password", "", "source password")

		targetType = flag.String("target-type", "", "target database type (sqlite|mysql|postgres) [required]")
		targetPath = flag.String("target-path", "", "target sqlite path")
		targetHost = flag.String("target-host", "", "target host")
		targetPort = flag.String("target-port", "", "target port")
		targetName = flag.String("target-name", "", "target database name")
		targetUser = flag.String("target-user", "", "target user")
		targetPass = flag.String("target-password", "", "target password")

		truncate = flag.Bool("truncate-target", false, "delete existing rows in target tables before copy")
		switchTo = flag.Bool("switch", false, "write target config into .env after successful migration")
		batch    = flag.Int("batch-size", 200, "rows per batch")
		dryRun   = flag.Bool("dry-run", false, "only test connections and print plan")
	)
	flag.Parse()

	base, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	sourceCfg := applyDBFlags(base, *sourceType, *sourcePath, *sourceHost, *sourcePort, *sourceName, *sourceUser, *sourcePass, true)
	if strings.TrimSpace(*targetType) == "" {
		fmt.Fprintln(os.Stderr, "error: -target-type is required")
		flag.Usage()
		os.Exit(2)
	}
	targetCfg := applyDBFlags(base, *targetType, *targetPath, *targetHost, *targetPort, *targetName, *targetUser, *targetPass, false)

	fmt.Printf("Source: %s\n", describeDB(sourceCfg))
	fmt.Printf("Target: %s\n", describeDB(targetCfg))

	if err := dbmigrate.TestConnection(sourceCfg); err != nil {
		log.Fatalf("source connection failed: %v", err)
	}
	fmt.Println("Source connection: ok")
	if err := dbmigrate.TestConnection(targetCfg); err != nil {
		log.Fatalf("target connection failed: %v", err)
	}
	fmt.Println("Target connection: ok")

	if *dryRun {
		fmt.Println("Dry run only; no data copied.")
		for _, t := range data.MigrateTables() {
			fmt.Printf("  - %s\n", t.Name)
		}
		return
	}

	result, err := dbmigrate.Migrate(context.Background(), sourceCfg, targetCfg, dbmigrate.Options{
		TruncateTarget: *truncate,
		SwitchRuntime:  *switchTo,
		BatchSize:      *batch,
		OnProgress: func(table string, done, total int64) {
			fmt.Printf("  %s: %d/%d\n", table, done, total)
		},
	})
	if err != nil {
		log.Fatalf("migrate failed: %v", err)
	}

	fmt.Println("Migration completed.")
	for _, t := range result.Tables {
		fmt.Printf("  %s: %d rows\n", t.Table, t.Rows)
	}
	if result.Switched {
		fmt.Println("Runtime config switched to target (.env updated). Restart the app if it is already running.")
	}
}

func applyDBFlags(base config.Config, dbType, path, host, port, name, user, pass string, useBaseWhenEmpty bool) config.Config {
	cfg := base
	t := strings.ToLower(strings.TrimSpace(dbType))
	if t == "" && useBaseWhenEmpty {
		t = strings.ToLower(strings.TrimSpace(base.DatabaseType))
	}
	if t == "postgresql" {
		t = "postgres"
	}
	cfg.DatabaseType = t

	switch t {
	case "sqlite":
		p := strings.TrimSpace(path)
		if p == "" && useBaseWhenEmpty {
			p = strings.TrimSpace(base.DatabasePath)
		}
		if p == "" {
			p = "storage/data/skyimage.db"
		}
		cfg.DatabasePath = p
		cfg.DatabaseHost = ""
		cfg.DatabasePort = ""
		cfg.DatabaseName = ""
		cfg.DatabaseUser = ""
		cfg.DatabasePassword = ""
	case "mysql", "postgres":
		cfg.DatabaseHost = pick(host, useBaseWhenEmpty, base.DatabaseHost)
		cfg.DatabasePort = pick(port, useBaseWhenEmpty, base.DatabasePort)
		cfg.DatabaseName = pick(name, useBaseWhenEmpty, base.DatabaseName)
		cfg.DatabaseUser = pick(user, useBaseWhenEmpty, base.DatabaseUser)
		cfg.DatabasePassword = pick(pass, useBaseWhenEmpty, base.DatabasePassword)
		cfg.DatabasePath = ""
	}
	return cfg
}

func pick(primary string, useFallback bool, fallback string) string {
	if v := strings.TrimSpace(primary); v != "" {
		return v
	}
	if useFallback {
		return strings.TrimSpace(fallback)
	}
	return ""
}

func describeDB(cfg config.Config) string {
	t := data.DialectorType(cfg)
	switch t {
	case "sqlite":
		return fmt.Sprintf("sqlite path=%s", cfg.DatabasePath)
	case "mysql", "postgres":
		return fmt.Sprintf("%s %s@%s:%s/%s", t, cfg.DatabaseUser, cfg.DatabaseHost, cfg.DatabasePort, cfg.DatabaseName)
	default:
		return t
	}
}
