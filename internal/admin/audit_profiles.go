package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"gorm.io/datatypes"

	"skyimage/internal/data"
)

const AuditProviderUAPINSFW = "uapis_nsfw"

var ErrAuditProfileInUse = errors.New("audit profile in use")

type AuditProfilePayload struct {
	Name     string                 `json:"name"`
	Provider string                 `json:"provider"`
	Configs  map[string]interface{} `json:"configs"`
}

func (s *Service) ListAuditProfiles(ctx context.Context) ([]data.AuditProfile, error) {
	var items []data.AuditProfile
	err := s.db.WithContext(ctx).Order("id ASC").Find(&items).Error
	return items, err
}

func (s *Service) FindAuditProfileByID(ctx context.Context, id uint) (data.AuditProfile, error) {
	var profile data.AuditProfile
	err := s.db.WithContext(ctx).First(&profile, id).Error
	return profile, err
}

func (s *Service) CreateAuditProfile(ctx context.Context, payload AuditProfilePayload) (data.AuditProfile, error) {
	configs, err := normalizeAuditProfileConfigs(payload.Provider, payload.Configs)
	if err != nil {
		return data.AuditProfile{}, err
	}
	cfgBytes, _ := json.Marshal(configs)
	profile := data.AuditProfile{
		Name:     strings.TrimSpace(payload.Name),
		Provider: AuditProviderUAPINSFW,
		Configs:  datatypes.JSON(cfgBytes),
	}
	if profile.Name == "" {
		return data.AuditProfile{}, fmt.Errorf("审核配置名称不能为空")
	}
	if err := s.db.WithContext(ctx).Create(&profile).Error; err != nil {
		return data.AuditProfile{}, err
	}
	return profile, nil
}

func (s *Service) UpdateAuditProfile(ctx context.Context, id uint, payload AuditProfilePayload) (data.AuditProfile, error) {
	configs, err := normalizeAuditProfileConfigs(payload.Provider, payload.Configs)
	if err != nil {
		return data.AuditProfile{}, err
	}
	var profile data.AuditProfile
	if err := s.db.WithContext(ctx).First(&profile, id).Error; err != nil {
		return data.AuditProfile{}, err
	}
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		return data.AuditProfile{}, fmt.Errorf("审核配置名称不能为空")
	}
	cfgBytes, _ := json.Marshal(configs)
	profile.Name = name
	profile.Provider = AuditProviderUAPINSFW
	profile.Configs = datatypes.JSON(cfgBytes)
	if err := s.db.WithContext(ctx).Save(&profile).Error; err != nil {
		return data.AuditProfile{}, err
	}
	return profile, nil
}

func (s *Service) DeleteAuditProfile(ctx context.Context, id uint) error {
	var profile data.AuditProfile
	if err := s.db.WithContext(ctx).First(&profile, id).Error; err != nil {
		return err
	}
	references, err := s.findStrategiesUsingAuditProfile(ctx, id)
	if err != nil {
		return err
	}
	if len(references) > 0 {
		names := make([]string, 0, len(references))
		for _, item := range references {
			names = append(names, item.Name)
		}
		return fmt.Errorf("%w: 审核配置正在被以下存储策略使用：%s", ErrAuditProfileInUse, strings.Join(names, "、"))
	}
	return s.db.WithContext(ctx).Delete(&data.AuditProfile{}, id).Error
}

func normalizeAuditProfileConfigs(provider string, configs map[string]interface{}) (map[string]interface{}, error) {
	if configs == nil {
		configs = map[string]interface{}{}
	}
	normalizedProvider := strings.ToLower(strings.TrimSpace(provider))
	if normalizedProvider == "" {
		normalizedProvider = AuditProviderUAPINSFW
	}
	if normalizedProvider != AuditProviderUAPINSFW {
		return nil, fmt.Errorf("仅支持 UAPI 图片审核配置")
	}
	apiKey := strings.TrimSpace(firstConfigString(configs, "api_key", "apiKey"))
	maxConcurrency := auditIntFromAny(configs["max_concurrency"])
	if maxConcurrency <= 0 {
		maxConcurrency = auditIntFromAny(configs["maxConcurrency"])
	}
	if maxConcurrency <= 0 {
		maxConcurrency = 1
	}
	return map[string]interface{}{
		"api_key":         apiKey,
		"max_concurrency": maxConcurrency,
	}, nil
}

func (s *Service) findStrategiesUsingAuditProfile(ctx context.Context, profileID uint) ([]data.Strategy, error) {
	var strategies []data.Strategy
	if err := s.db.WithContext(ctx).Order("id ASC").Find(&strategies).Error; err != nil {
		return nil, err
	}
	result := make([]data.Strategy, 0)
	for _, strategy := range strategies {
		if strategyReferencesAuditProfile(strategy, profileID) {
			result = append(result, strategy)
		}
	}
	return result, nil
}

func strategyReferencesAuditProfile(strategy data.Strategy, profileID uint) bool {
	if profileID == 0 || len(strategy.Configs) == 0 {
		return false
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(strategy.Configs, &cfg); err != nil {
		return false
	}
	return uint(auditIntFromAny(cfg["image_audit_profile_id"])) == profileID
}

func (s *Service) ensureAuditProfileExistsInConfigs(ctx context.Context, configs map[string]interface{}) error {
	profileID := uint(auditIntFromAny(configs["image_audit_profile_id"]))
	if profileID == 0 {
		return nil
	}
	var count int64
	if err := s.db.WithContext(ctx).Model(&data.AuditProfile{}).Where("id = ?", profileID).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("所选图片审核配置不存在")
	}
	return nil
}

func auditIntFromAny(value interface{}) int {
	switch v := value.(type) {
	case float64:
		return int(v)
	case int:
		return v
	case int64:
		return int(v)
	case string:
		if parsed, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return parsed
		}
		return 0
	default:
		return 0
	}
}
