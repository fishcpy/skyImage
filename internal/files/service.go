package files

import (
	"context"
	"crypto/md5"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"math/rand"
	"mime/multipart"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"skyimage/internal/config"
	"skyimage/internal/data"
	"skyimage/internal/users"
)

type Service struct {
	db  *gorm.DB
	cfg config.Config
}

func New(db *gorm.DB, cfg config.Config) *Service {
	return &Service{
		db:  db,
		cfg: cfg,
	}
}

type UploadOptions struct {
	Visibility string
	StrategyID uint
}

type FileDTO struct {
	ID            uint      `json:"id"`
	Key           string    `json:"key"`
	Name          string    `json:"name"`
	OriginalName  string    `json:"originalName"`
	Size          int64     `json:"size"`
	MimeType      string    `json:"mimeType"`
	Extension     string    `json:"extension"`
	Visibility    string    `json:"visibility"`
	Storage       string    `json:"storage"`
	StrategyID    uint      `json:"strategyId"`
	StrategyName  string    `json:"strategyName"`
	CreatedAt     time.Time `json:"createdAt"`
	ViewURL       string    `json:"viewUrl"`
	DirectURL     string    `json:"directUrl"`
	Markdown      string    `json:"markdown"`
	HTML          string    `json:"html"`
	OwnerID       uint      `json:"ownerId,omitempty"`
	OwnerName     string    `json:"ownerName,omitempty"`
	OwnerEmail    string    `json:"ownerEmail,omitempty"`
	RelativePath  string    `json:"relativePath"`
	StorageDriver string    `json:"storageDriver"`
}

type strategyConfig struct {
	Driver  string
	Root    string
	Base    string
	Pattern string
	Query   string
}

func (s *Service) Upload(ctx context.Context, user data.User, file *multipart.FileHeader, opts UploadOptions) (data.FileAsset, error) {
	strategy, cfg, err := s.resolveStrategy(ctx, user, opts.StrategyID)
	if err != nil {
		return data.FileAsset{}, err
	}

	// Check file size limit and capacity limit from group config
	if user.GroupID != nil {
		var group data.Group
		if err := s.db.WithContext(ctx).First(&group, *user.GroupID).Error; err == nil {
			var groupCfg map[string]interface{}
			if len(group.Configs) > 0 {
				if err := json.Unmarshal(group.Configs, &groupCfg); err == nil {
					// Check single file size limit
					if maxSize, ok := groupCfg["max_file_size"]; ok {
						var maxBytes int64
						switch v := maxSize.(type) {
						case float64:
							maxBytes = int64(v)
						case int:
							maxBytes = int64(v)
						case int64:
							maxBytes = v
						}
						if maxBytes > 0 && file.Size > maxBytes {
							// Format bytes to MB for user-friendly error message
							fileSizeMB := float64(file.Size) / (1024 * 1024)
							maxSizeMB := float64(maxBytes) / (1024 * 1024)
							return data.FileAsset{}, fmt.Errorf("文件大小 %.2f MB 超过限制 %.2f MB", fileSizeMB, maxSizeMB)
						}
					}

					// Check total capacity limit
					if maxCapacity, ok := groupCfg["max_capacity"]; ok {
						var maxCapBytes float64
						switch v := maxCapacity.(type) {
						case float64:
							maxCapBytes = v
						case int:
							maxCapBytes = float64(v)
						case int64:
							maxCapBytes = float64(v)
						}
						if maxCapBytes > 0 {
							// Get current used capacity
							var currentUser data.User
							if err := s.db.WithContext(ctx).First(&currentUser, user.ID).Error; err == nil {
								futureUsed := currentUser.UsedCapacity + float64(file.Size)
								if futureUsed > maxCapBytes {
									usedMB := currentUser.UsedCapacity / (1024 * 1024)
									fileSizeMB := float64(file.Size) / (1024 * 1024)
									maxCapMB := maxCapBytes / (1024 * 1024)
									return data.FileAsset{}, fmt.Errorf("容量不足：已使用 %.2f MB，上传此文件需要 %.2f MB，容量上限 %.2f MB", usedMB, fileSizeMB, maxCapMB)
								}
							}
						}
					}
				}
			}
		}
	}

	handle, err := file.Open()
	if err != nil {
		return data.FileAsset{}, err
	}
	defer handle.Close()

	key := uuid.NewString()
	now := time.Now()
	relativePath := s.buildRelativePath(cfg, user, file.Filename, key, now)
	if relativePath == "" {
		relativePath = fmt.Sprintf(
			"%d/%02d/%02d/%s%s",
			now.Year(),
			now.Month(),
			now.Day(),
			key,
			filepath.Ext(file.Filename),
		)
	}
	destPath := filepath.Join(cfg.Root, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return data.FileAsset{}, err
	}
	dest, err := os.Create(destPath)
	if err != nil {
		return data.FileAsset{}, err
	}
	defer dest.Close()

	md5Hasher := md5.New()
	sha1Hasher := sha1.New()
	size, err := io.Copy(dest, io.TeeReader(handle, io.MultiWriter(md5Hasher, sha1Hasher)))
	if err != nil {
		return data.FileAsset{}, err
	}

	fileAsset := data.FileAsset{
		UserID:          user.ID,
		GroupID:         user.GroupID,
		StrategyID:      strategy.ID,
		Key:             key,
		Path:            destPath,
		RelativePath:    filepath.ToSlash(relativePath),
		Name:            filepath.Base(destPath),
		OriginalName:    file.Filename,
		Size:            size,
		MimeType:        file.Header.Get("Content-Type"),
		Extension:       strings.TrimPrefix(strings.ToLower(filepath.Ext(destPath)), "."),
		ChecksumMD5:     hex.EncodeToString(md5Hasher.Sum(nil)),
		ChecksumSHA1:    hex.EncodeToString(sha1Hasher.Sum(nil)),
		Visibility:      users.NormalizeVisibility(opts.Visibility),
		StorageProvider: cfg.Driver,
	}

	if fileAsset.MimeType == "" {
		fileAsset.MimeType = "application/octet-stream"
	}

	if err := s.db.WithContext(ctx).Create(&fileAsset).Error; err != nil {
		return data.FileAsset{}, err
	}

	_ = s.db.WithContext(ctx).Model(&data.User{}).
		Where("id = ?", user.ID).
		UpdateColumn("use_capacity", gorm.Expr("use_capacity + ?", fileAsset.Size))

	return fileAsset, nil
}

func (s *Service) ToDTO(ctx context.Context, file data.FileAsset) (FileDTO, error) {
	if file.User.ID == 0 {
		if err := s.db.WithContext(ctx).First(&file.User, file.UserID).Error; err != nil {
			return FileDTO{}, err
		}
	}
	if file.Strategy.ID == 0 && file.StrategyID != 0 {
		if err := s.db.WithContext(ctx).First(&file.Strategy, file.StrategyID).Error; err != nil {
			return FileDTO{}, err
		}
	}
	publicURL, err := s.PublicURL(ctx, file)
	if err != nil {
		return FileDTO{}, err
	}

	markdown := fmt.Sprintf("![%s](%s)", file.OriginalName, publicURL)
	html := fmt.Sprintf("<img src=\"%s\" alt=\"%s\" />", publicURL, file.OriginalName)

	return FileDTO{
		ID:            file.ID,
		Key:           file.Key,
		Name:          file.Name,
		OriginalName:  file.OriginalName,
		Size:          file.Size,
		MimeType:      file.MimeType,
		Extension:     file.Extension,
		Visibility:    file.Visibility,
		Storage:       file.StorageProvider,
		CreatedAt:     file.CreatedAt,
		ViewURL:       publicURL,
		DirectURL:     publicURL,
		Markdown:      markdown,
		HTML:          html,
		OwnerID:       file.UserID,
		OwnerName:     file.User.Name,
		OwnerEmail:    file.User.Email,
		StrategyID:    file.StrategyID,
		StrategyName:  file.Strategy.Name,
		RelativePath:  file.RelativePath,
		StorageDriver: file.StorageProvider,
	}, nil
}

// PublicURL returns the preferred public URL for a file asset based on its storage strategy.
func (s *Service) PublicURL(ctx context.Context, file data.FileAsset) (string, error) {
	if file.Strategy.ID == 0 && file.StrategyID != 0 {
		if err := s.db.WithContext(ctx).First(&file.Strategy, file.StrategyID).Error; err != nil {
			return "", err
		}
	}
	publicURL := sanitizeURL(s.buildPublicURL(file))
	if publicURL == "" {
		return "", fmt.Errorf("storage strategy %d has no external access domain", file.StrategyID)
	}
	return publicURL, nil
}

func (s *Service) buildPublicURL(file data.FileAsset) string {
	cfg := s.parseStrategyConfig(file.Strategy)
	base := strings.TrimSpace(cfg.Base)
	if base == "" {
		return ""
	}
	rel := deriveRelativePath(file, cfg)
	if rel == "" {
		rel = file.Name
	}
	publicURL := joinPublicURL(base, rel)
	if cfg.Query != "" {
		publicURL = appendQuery(publicURL, cfg.Query)
	}
	return publicURL
}

func (s *Service) List(ctx context.Context, userID uint, limit int, offset int) ([]data.FileAsset, error) {
	if limit == 0 {
		limit = 20
	}
	var files []data.FileAsset
	err := s.db.WithContext(ctx).
		Preload("User").
		Preload("Strategy").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&files).Error
	return files, err
}

func (s *Service) FindByID(ctx context.Context, id uint) (data.FileAsset, error) {
	var file data.FileAsset
	err := s.db.WithContext(ctx).
		Preload("User").
		Preload("Strategy").
		First(&file, id).Error
	return file, err
}

func (s *Service) FindByKey(ctx context.Context, key string) (data.FileAsset, error) {
	var file data.FileAsset
	err := s.db.WithContext(ctx).
		Preload("User").
		Preload("Strategy").
		Where("key = ?", key).
		First(&file).Error
	return file, err
}

func (s *Service) ListPublic(ctx context.Context, limit int, offset int) ([]data.FileAsset, error) {
	if limit == 0 {
		limit = 40
	}
	var files []data.FileAsset
	err := s.db.WithContext(ctx).
		Preload("User").
		Preload("Strategy").
		Where("visibility = ?", "public").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&files).Error
	return files, err
}

func (s *Service) ListStrategiesForUser(ctx context.Context, user data.User) ([]data.Strategy, error) {
	var strategies []data.Strategy

	// 如果用户没有角色组，返回空列表
	if user.GroupID == nil {
		return strategies, nil
	}

	// 查询用户角色组关联的策略
	query := s.db.WithContext(ctx).Model(&data.Strategy{}).
		Joins("JOIN group_strategy gs ON gs.strategy_id = strategies.id").
		Where("gs.group_id = ?", *user.GroupID)

	if err := query.Order("id ASC").Find(&strategies).Error; err != nil {
		return nil, err
	}

	// 如果角色组没有关联任何策略，返回空列表（不再回退到所有策略）
	return strategies, nil
}

func (s *Service) Delete(ctx context.Context, userID uint, id uint) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var file data.FileAsset
		if err := tx.First(&file, "id = ? AND user_id = ?", id, userID).Error; err != nil {
			return err
		}
		if err := tx.Delete(&data.FileAsset{}, id).Error; err != nil {
			return err
		}
		if err := tx.Model(&data.User{}).
			Where("id = ?", userID).
			UpdateColumn("use_capacity", gorm.Expr("use_capacity - ?", file.Size)).Error; err != nil {
			return err
		}
		return removeFile(file.Path)
	})
}

func (s *Service) DeleteByAdmin(ctx context.Context, id uint) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var file data.FileAsset
		if err := tx.First(&file, "id = ?", id).Error; err != nil {
			return err
		}
		if err := tx.Delete(&data.FileAsset{}, id).Error; err != nil {
			return err
		}
		return removeFile(file.Path)
	})
}

func removeFile(path string) error {
	if err := os.Remove(path); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return err
	}
	return nil
}

func (s *Service) resolveStrategy(ctx context.Context, user data.User, requested uint) (data.Strategy, strategyConfig, error) {
	strategies, err := s.ListStrategiesForUser(ctx, user)
	if err != nil {
		return data.Strategy{}, strategyConfig{}, err
	}
	if len(strategies) == 0 {
		return data.Strategy{}, strategyConfig{}, fmt.Errorf("没有可用的储存策略")
	}
	var selected data.Strategy
	if requested > 0 {
		for _, item := range strategies {
			if item.ID == requested {
				selected = item
				break
			}
		}
	}
	if selected.ID == 0 {
		if preferred := users.DefaultStrategyID(user); preferred != nil {
			for _, item := range strategies {
				if item.ID == *preferred {
					selected = item
					break
				}
			}
		}
	}
	if selected.ID == 0 {
		selected = strategies[0]
	}
	return selected, s.parseStrategyConfig(selected), nil
}

func (s *Service) parseStrategyConfig(strategy data.Strategy) strategyConfig {
	cfg := strategyConfig{
		Driver:  "local",
		Root:    s.cfg.StoragePath,
		Base:    s.cfg.PublicBaseURL,
		Pattern: "",
		Query:   "",
	}
	if len(strategy.Configs) > 0 {
		var raw map[string]interface{}
		if err := json.Unmarshal(strategy.Configs, &raw); err == nil {
			if v := stringFromAny(raw["driver"]); v != "" {
				cfg.Driver = v
			}
			if v := stringFromAny(raw["root"]); v != "" {
				cfg.Root = v
			}
			if v := stringFromAny(raw["url"]); v != "" {
				cfg.Base = v
			}
			if v := stringFromAny(raw["base_url"]); v != "" {
				cfg.Base = v
			}
			if v := stringFromAny(raw["baseUrl"]); v != "" {
				cfg.Base = v
			}
			if v := stringFromAny(raw["pattern"]); v != "" {
				cfg.Pattern = v
			}
			if v := stringFromAny(raw["path_template"]); v != "" {
				cfg.Pattern = v
			}
			if v := stringFromAny(raw["queries"]); v != "" {
				cfg.Query = v
			}
			if v := stringFromAny(raw["query"]); v != "" {
				cfg.Query = v
			}
		}
	}
	if cfg.Pattern == "" {
		cfg.Pattern = "{year}/{month}/{day}/{uuid}"
	}
	cfg.Base = s.normalizeExternalBase(cfg.Base, cfg.Driver, cfg.Root)
	cfg.Query = strings.TrimSpace(cfg.Query)
	return cfg
}

func deriveBaseFromAddr(addr string) string {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		addr = ":8080"
	}
	if strings.HasPrefix(addr, "http://") || strings.HasPrefix(addr, "https://") {
		return addr
	}
	if strings.HasPrefix(addr, ":") {
		return "http://localhost" + addr
	}
	if strings.HasPrefix(addr, "//") {
		return "http:" + addr
	}
	return "http://" + addr
}

func sanitizeURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		if idx := tokenQueryIndex(trimmed); idx >= 0 {
			return trimmed[:idx]
		}
		return trimmed
	}
	query := parsed.Query()
	if len(query) == 0 {
		return trimmed
	}
	if _, ok := query["token"]; ok {
		query.Del("token")
		if len(query) == 0 {
			parsed.RawQuery = ""
		} else {
			parsed.RawQuery = query.Encode()
		}
		return parsed.String()
	}
	return trimmed
}

var randPattern = regexp.MustCompile(`\{rand(\d{1,3})\}`)

func (s *Service) buildRelativePath(cfg strategyConfig, user data.User, originalName string, key string, now time.Time) string {
	pattern := strings.TrimSpace(cfg.Pattern)
	if pattern == "" {
		pattern = "{year}/{month}/{day}/{uuid}"
	}
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(originalName)), ".")
	baseName := strings.TrimSuffix(originalName, filepath.Ext(originalName))
	replacements := map[string]string{
		"{year}":     fmt.Sprintf("%04d", now.Year()),
		"{month}":    fmt.Sprintf("%02d", int(now.Month())),
		"{day}":      fmt.Sprintf("%02d", now.Day()),
		"{hour}":     fmt.Sprintf("%02d", now.Hour()),
		"{minute}":   fmt.Sprintf("%02d", now.Minute()),
		"{second}":   fmt.Sprintf("%02d", now.Second()),
		"{unix}":     fmt.Sprintf("%d", now.Unix()),
		"{uuid}":     key,
		"{userId}":   fmt.Sprintf("%d", user.ID),
		"{userName}": sanitizePathComponent(user.Name),
		"{original}": sanitizePathComponent(baseName),
	}
	result := pattern
	for token, value := range replacements {
		result = strings.ReplaceAll(result, token, value)
	}
	result = randPattern.ReplaceAllStringFunc(result, func(token string) string {
		lengthStr := strings.TrimSuffix(strings.TrimPrefix(token, "{rand"), "}")
		length, err := strconv.Atoi(lengthStr)
		if err != nil || length <= 0 {
			length = 6
		}
		return randomDigits(length)
	})
	if strings.Contains(result, "{ext}") {
		result = strings.ReplaceAll(result, "{ext}", ext)
	}
	result = sanitizeRelativePath(result)
	if result == "" {
		result = key
	}
	if ext != "" && !strings.Contains(pattern, "{ext}") {
		if !strings.HasSuffix(strings.ToLower(result), "."+ext) {
			result = result + "." + ext
		}
	}
	return result
}

func sanitizePathComponent(value string) string {
	clean := strings.TrimSpace(value)
	if clean == "" {
		return ""
	}
	clean = strings.ReplaceAll(clean, string(os.PathSeparator), "-")
	clean = strings.ReplaceAll(clean, "/", "-")
	return clean
}

func sanitizeRelativePath(value string) string {
	if value == "" {
		return ""
	}
	clean := strings.ReplaceAll(value, "\\", "/")
	clean = strings.ReplaceAll(clean, "..", "")
	clean = strings.Trim(clean, "/")
	return clean
}

func randomDigits(length int) string {
	if length <= 0 {
		length = 6
	}
	var builder strings.Builder
	for i := 0; i < length; i++ {
		builder.WriteByte(byte('0' + rand.Intn(10)))
	}
	return builder.String()
}

func joinPublicURL(base string, rel string) string {
	trimmedBase := strings.TrimRight(strings.TrimSpace(base), "/")
	trimmedRel := strings.TrimLeft(strings.TrimSpace(rel), "/")
	if trimmedRel == "" {
		return trimmedBase
	}
	if trimmedBase == "" {
		return "/" + trimmedRel
	}
	return trimmedBase + "/" + trimmedRel
}

func appendQuery(base string, query string) string {
	clean := strings.TrimSpace(query)
	if clean == "" {
		return base
	}
	clean = strings.TrimLeft(clean, "&?")
	if clean == "" {
		return base
	}
	if strings.Contains(base, "?") {
		if strings.HasSuffix(base, "?") || strings.HasSuffix(base, "&") {
			return base + clean
		}
		return base + "&" + clean
	}
	return base + "?" + clean
}

func tokenQueryIndex(raw string) int {
	lower := strings.ToLower(raw)
	return strings.Index(lower, "?token=")
}

func deriveRelativePath(file data.FileAsset, cfg strategyConfig) string {
	rel := sanitizeRelativePath(strings.TrimSpace(file.RelativePath))
	if rel != "" {
		return rel
	}
	if trimmed := trimRelativeFromRoot(file.Path, cfg.Root); trimmed != "" {
		return trimmed
	}
	candidate := sanitizeRelativePath(strings.TrimSpace(file.Path))
	if candidate != "" && filepath.VolumeName(file.Path) == "" {
		return candidate
	}
	if file.Name != "" {
		return strings.TrimLeft(file.Name, "/")
	}
	return ""
}

func trimRelativeFromRoot(fullPath string, root string) string {
	fullPath = strings.TrimSpace(fullPath)
	root = strings.TrimSpace(root)
	if fullPath == "" || root == "" {
		return ""
	}
	if rel, err := filepath.Rel(root, fullPath); err == nil && rel != "." {
		return sanitizeRelativePath(rel)
	}
	normalizedFull := sanitizeRelativePath(fullPath)
	normalizedRoot := strings.TrimRight(sanitizeRelativePath(root), "/")
	if normalizedRoot == "" {
		return ""
	}
	if strings.HasPrefix(normalizedFull, normalizedRoot+"/") {
		return strings.TrimLeft(normalizedFull[len(normalizedRoot):], "/")
	}
	if normalizedFull == normalizedRoot {
		return ""
	}
	return ""
}

func (s *Service) normalizeExternalBase(base string, driver string, root string) string {
	base = strings.TrimSpace(base)
	if base == "" {
		base = s.cfg.PublicBaseURL
	}
	lower := strings.ToLower(base)
	switch {
	case strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://"):
		base = strings.TrimRight(base, "/")
	case strings.HasPrefix(base, "//"):
		base = "http:" + strings.TrimRight(base, "/")
	case strings.HasPrefix(base, "/"):
		segment := strings.Trim(base, "/")
		if segment == "" {
			segment = s.storageSegment(root)
		}
		base = s.defaultBaseURL()
		if segment != "" {
			base = base + "/" + segment
		}
	default:
		// 处理 example.com 或 example.com/path 格式
		// 不要移除路径部分的斜杠
		base = "http://" + strings.TrimRight(base, "/")
	}

	if driver == "" {
		driver = "local"
	}
	if driver == "local" && !hasURLPath(base) {
		if segment := s.storageSegment(root); segment != "" {
			base = base + "/" + segment
		}
	}
	return base
}

func (s *Service) defaultBaseURL() string {
	base := strings.TrimSpace(s.cfg.PublicBaseURL)
	if base == "" {
		base = deriveBaseFromAddr(s.cfg.HTTPAddr)
	}
	if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
		base = "http://" + strings.TrimLeft(base, "/")
	}
	return strings.TrimRight(base, "/")
}

func (s *Service) storageSegment(root string) string {
	path := strings.TrimSpace(root)
	if path == "" {
		path = s.cfg.StoragePath
	}
	segment := filepath.Base(path)
	segment = strings.Trim(segment, "/")
	if segment == "" || segment == "." {
		return "uploads"
	}
	return segment
}

func hasURLPath(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	path := strings.Trim(parsed.Path, "/")
	return path != ""
}

func stringFromAny(value interface{}) string {
	switch v := value.(type) {
	case string:
		return v
	case []byte:
		return string(v)
	default:
		return ""
	}
}
