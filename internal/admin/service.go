package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"skyimage/internal/data"
)

type Service struct {
	db *gorm.DB
}

func New(db *gorm.DB) *Service {
	return &Service{db: db}
}

type DashboardMetrics struct {
	UserCount     int64             `json:"userCount"`
	FileCount     int64             `json:"fileCount"`
	StorageUsed   int64             `json:"storageUsed"`
	LastUploadAt  *time.Time        `json:"lastUploadAt"`
	RecentUploads []data.FileAsset  `json:"recentUploads"`
	Settings      map[string]string `json:"settings"`
}

func (s *Service) Dashboard(ctx context.Context) (DashboardMetrics, error) {
	var metrics DashboardMetrics
	if err := s.db.WithContext(ctx).Model(&data.User{}).Count(&metrics.UserCount).Error; err != nil {
		return metrics, err
	}
	if err := s.db.WithContext(ctx).Model(&data.FileAsset{}).Count(&metrics.FileCount).Error; err != nil {
		return metrics, err
	}
	if err := s.db.WithContext(ctx).Model(&data.FileAsset{}).Select("COALESCE(SUM(size),0)").Scan(&metrics.StorageUsed).Error; err != nil {
		return metrics, err
	}
	var last data.FileAsset
	if err := s.db.WithContext(ctx).Order("created_at DESC").First(&last).Error; err == nil {
		metrics.LastUploadAt = &last.CreatedAt
	}
	if err := s.db.WithContext(ctx).Order("created_at DESC").Limit(5).Find(&metrics.RecentUploads).Error; err != nil {
		return metrics, err
	}
	settings, err := s.GetSettings(ctx)
	if err != nil {
		return metrics, err
	}
	metrics.Settings = settings
	return metrics, nil
}

func (s *Service) GetSettings(ctx context.Context) (map[string]string, error) {
	var entries []data.ConfigEntry
	if err := s.db.WithContext(ctx).Find(&entries).Error; err != nil {
		return nil, err
	}
	settings := make(map[string]string, len(entries))
	for _, entry := range entries {
		settings[entry.Key] = entry.Value
	}
	return settings, nil
}

func (s *Service) UpdateSettings(ctx context.Context, kv map[string]string) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for key, value := range kv {
			if err := tx.Save(&data.ConfigEntry{Key: key, Value: value}).Error; err != nil {
				return fmt.Errorf("save config %s: %w", key, err)
			}
		}
		return nil
	})
}

type GroupPayload struct {
	Name      string                 `json:"name"`
	IsDefault bool                   `json:"isDefault"`
	IsGuest   bool                   `json:"isGuest"`
	Configs   map[string]interface{} `json:"configs"`
}

func (s *Service) ListGroups(ctx context.Context) ([]data.Group, error) {
	var groups []data.Group
	err := s.db.WithContext(ctx).Order("id ASC").Find(&groups).Error
	return groups, err
}

func (s *Service) CreateGroup(ctx context.Context, payload GroupPayload) (data.Group, error) {
	// Validate configs
	if err := validateGroupConfigs(payload.Configs); err != nil {
		return data.Group{}, err
	}
	
	cfgBytes, _ := json.Marshal(payload.Configs)
	group := data.Group{
		Name:      payload.Name,
		IsDefault: payload.IsDefault,
		IsGuest:   payload.IsGuest,
		Configs:   datatypes.JSON(cfgBytes),
	}
	err := s.db.WithContext(ctx).Create(&group).Error
	if err != nil {
		return group, err
	}
	if payload.IsDefault {
		if err := s.ensureSingleDefaultGroup(ctx, group.ID); err != nil {
			return group, err
		}
	}
	return group, nil
}

func (s *Service) UpdateGroup(ctx context.Context, id uint, payload GroupPayload) (data.Group, error) {
	// Validate configs
	if err := validateGroupConfigs(payload.Configs); err != nil {
		return data.Group{}, err
	}
	
	group := data.Group{}
	if err := s.db.WithContext(ctx).First(&group, id).Error; err != nil {
		return group, err
	}
	cfgBytes, _ := json.Marshal(payload.Configs)
	group.Name = payload.Name
	group.IsGuest = payload.IsGuest
	group.IsDefault = payload.IsDefault
	group.Configs = datatypes.JSON(cfgBytes)
	if err := s.db.WithContext(ctx).Save(&group).Error; err != nil {
		return group, err
	}
	if payload.IsDefault {
		if err := s.ensureSingleDefaultGroup(ctx, group.ID); err != nil {
			return group, err
		}
	}
	return group, nil
}

func (s *Service) DeleteGroup(ctx context.Context, id uint) error {
	return s.db.WithContext(ctx).Delete(&data.Group{}, id).Error
}

func (s *Service) ensureSingleDefaultGroup(ctx context.Context, id uint) error {
	return s.db.WithContext(ctx).
		Model(&data.Group{}).
		Where("id <> ?", id).
		Update("is_default", false).Error
}

type StrategyPayload struct {
	Key      uint8                  `json:"key"`
	Name     string                 `json:"name"`
	Intro    string                 `json:"intro"`
	Configs  map[string]interface{} `json:"configs"`
	GroupIDs []uint                 `json:"groupIds"`
}

func (s *Service) ListStrategies(ctx context.Context) ([]data.Strategy, error) {
	var items []data.Strategy
	err := s.db.WithContext(ctx).
		Preload("Groups").
		Order("id ASC").
		Find(&items).Error
	return items, err
}

func (s *Service) CreateStrategy(ctx context.Context, payload StrategyPayload) (data.Strategy, error) {
	cfgBytes, _ := json.Marshal(payload.Configs)
	strategy := data.Strategy{
		Key:     payload.Key,
		Name:    payload.Name,
		Intro:   payload.Intro,
		Configs: datatypes.JSON(cfgBytes),
	}
	err := s.db.WithContext(ctx).Create(&strategy).Error
	if err != nil {
		return strategy, err
	}
	if err := s.replaceStrategyGroups(ctx, strategy.ID, payload.GroupIDs); err != nil {
		return strategy, err
	}
	return strategy, nil
}

func (s *Service) UpdateStrategy(ctx context.Context, id uint, payload StrategyPayload) (data.Strategy, error) {
	var strategy data.Strategy
	if err := s.db.WithContext(ctx).First(&strategy, id).Error; err != nil {
		return strategy, err
	}
	cfgBytes, _ := json.Marshal(payload.Configs)
	strategy.Key = payload.Key
	strategy.Name = payload.Name
	strategy.Intro = payload.Intro
	strategy.Configs = datatypes.JSON(cfgBytes)
	if err := s.db.WithContext(ctx).Save(&strategy).Error; err != nil {
		return strategy, err
	}
	if err := s.replaceStrategyGroups(ctx, strategy.ID, payload.GroupIDs); err != nil {
		return strategy, err
	}
	return strategy, nil
}

func (s *Service) DeleteStrategy(ctx context.Context, id uint) error {
	return s.db.WithContext(ctx).Delete(&data.Strategy{}, id).Error
}

func (s *Service) ListAllFiles(ctx context.Context, limit, offset int) ([]data.FileAsset, error) {
	if limit <= 0 {
		limit = 50
	}
	var files []data.FileAsset
	err := s.db.WithContext(ctx).
		Preload("User").
		Preload("Strategy").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&files).Error
	return files, err
}

func (s *Service) DeleteFile(ctx context.Context, id uint) error {
	return s.db.WithContext(ctx).Delete(&data.FileAsset{}, id).Error
}

func (s *Service) replaceStrategyGroups(ctx context.Context, strategyID uint, groupIDs []uint) error {
	ids := uniqueUint(groupIDs)
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("strategy_id = ?", strategyID).Delete(&data.GroupStrategy{}).Error; err != nil {
			return err
		}
		if len(ids) == 0 {
			return nil
		}
		for _, id := range ids {
			link := data.GroupStrategy{GroupID: id, StrategyID: strategyID}
			if err := tx.Create(&link).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func uniqueUint(values []uint) []uint {
	seen := make(map[uint]struct{}, len(values))
	result := make([]uint, 0, len(values))
	for _, v := range values {
		if v == 0 {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		result = append(result, v)
	}
	return result
}

func validateGroupConfigs(configs map[string]interface{}) error {
	if configs == nil {
		return nil
	}
	
	// Validate max_file_size
	if maxFileSize, ok := configs["max_file_size"]; ok {
		var size float64
		switch v := maxFileSize.(type) {
		case float64:
			size = v
		case int:
			size = float64(v)
		case int64:
			size = float64(v)
		default:
			return fmt.Errorf("max_file_size 必须是数字")
		}
		if size < 0 {
			return fmt.Errorf("最大单文件大小必须大于等于 0")
		}
	}
	
	// Validate max_capacity
	if maxCapacity, ok := configs["max_capacity"]; ok {
		var capacity float64
		switch v := maxCapacity.(type) {
		case float64:
			capacity = v
		case int:
			capacity = float64(v)
		case int64:
			capacity = float64(v)
		default:
			return fmt.Errorf("max_capacity 必须是数字")
		}
		if capacity < 0 {
			return fmt.Errorf("容量上限必须大于等于 0")
		}
	}
	
	return nil
}
