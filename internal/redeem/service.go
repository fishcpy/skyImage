package redeem

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"gorm.io/gorm"

	"skyimage/internal/data"
)

const (
	RewardTypeGroup    = "group"
	RewardTypeCapacity = "capacity"
)

var (
	ErrCodeNotFound    = errors.New("redeem code not found")
	ErrCodeDisabled    = errors.New("redeem code is disabled")
	ErrCodeExhausted   = errors.New("redeem code has been fully used")
	ErrAlreadyRedeemed = errors.New("you have already redeemed this code")
	ErrGroupNotFound   = errors.New("role group not found")
	ErrInvalidCode     = errors.New("invalid redeem code")
	ErrInvalidReward   = errors.New("invalid reward configuration")
	ErrAdminRequired   = errors.New("admin required")
)

type Service struct {
	db *gorm.DB
}

func New(db *gorm.DB) *Service {
	return &Service{db: db}
}

type CreateInput struct {
	Code             string  `json:"code"`
	RewardType       string  `json:"rewardType"`
	GroupID          *uint   `json:"groupId"`
	CapacityDelta    float64 `json:"capacityDelta"`
	MaxUses          int     `json:"maxUses"`
	AllowMultiRedeem bool    `json:"allowMultiRedeem"`
	Enabled          *bool   `json:"enabled"`
	Note             string  `json:"note"`
	AutoGenerate     bool    `json:"autoGenerate"`
}

type UpdateInput struct {
	RewardType       *string  `json:"rewardType"`
	GroupID          *uint    `json:"groupId"`
	CapacityDelta    *float64 `json:"capacityDelta"`
	MaxUses          *int     `json:"maxUses"`
	AllowMultiRedeem *bool    `json:"allowMultiRedeem"`
	Enabled          *bool    `json:"enabled"`
	Note             *string  `json:"note"`
}

type RedeemResult struct {
	User  data.User       `json:"user"`
	Code  data.RedeemCode `json:"code"`
	Group *data.Group     `json:"group,omitempty"`
}

func (s *Service) List(ctx context.Context) ([]data.RedeemCode, error) {
	var items []data.RedeemCode
	err := s.db.WithContext(ctx).
		Preload("Group").
		Order("id DESC").
		Find(&items).Error
	return items, err
}

func (s *Service) Get(ctx context.Context, id uint) (data.RedeemCode, error) {
	var item data.RedeemCode
	err := s.db.WithContext(ctx).Preload("Group").First(&item, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return item, ErrCodeNotFound
	}
	return item, err
}

func (s *Service) ListUsages(ctx context.Context, codeID uint) ([]data.RedeemCodeUsage, error) {
	var items []data.RedeemCodeUsage
	err := s.db.WithContext(ctx).
		Preload("User").
		Where("redeem_code_id = ?", codeID).
		Order("id DESC").
		Find(&items).Error
	return items, err
}

func (s *Service) Create(ctx context.Context, actor data.User, input CreateInput) (data.RedeemCode, error) {
	if !actor.IsAdmin {
		return data.RedeemCode{}, ErrAdminRequired
	}

	rewardType := strings.ToLower(strings.TrimSpace(input.RewardType))
	if rewardType == "" {
		rewardType = RewardTypeGroup
	}
	if rewardType != RewardTypeGroup && rewardType != RewardTypeCapacity {
		return data.RedeemCode{}, ErrInvalidReward
	}

	var group *data.Group
	if rewardType == RewardTypeGroup {
		if input.GroupID == nil || *input.GroupID == 0 {
			return data.RedeemCode{}, ErrGroupNotFound
		}
		var g data.Group
		if err := s.db.WithContext(ctx).First(&g, *input.GroupID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return data.RedeemCode{}, ErrGroupNotFound
			}
			return data.RedeemCode{}, err
		}
		group = &g
	} else if input.CapacityDelta == 0 {
		return data.RedeemCode{}, ErrInvalidReward
	}

	code := strings.TrimSpace(input.Code)
	if input.AutoGenerate || code == "" {
		generated, err := generateCode()
		if err != nil {
			return data.RedeemCode{}, err
		}
		code = generated
	} else {
		code = normalizeCode(code)
		if code == "" {
			return data.RedeemCode{}, ErrInvalidCode
		}
	}

	maxUses := input.MaxUses
	if maxUses < 0 {
		maxUses = 0
	}

	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}

	item := data.RedeemCode{
		Code:             code,
		RewardType:       rewardType,
		GroupID:          input.GroupID,
		CapacityDelta:    input.CapacityDelta,
		MaxUses:          maxUses,
		UsedCount:        0,
		AllowMultiRedeem: input.AllowMultiRedeem,
		Enabled:          enabled,
		Note:             strings.TrimSpace(input.Note),
		CreatedBy:        actor.ID,
	}
	if rewardType == RewardTypeCapacity {
		item.GroupID = nil
	}

	// Select 强制写入零值字段（GORM 零值会跳过 default 字段）
	if err := s.db.WithContext(ctx).
		Select("Code", "RewardType", "GroupID", "CapacityDelta", "MaxUses", "UsedCount", "AllowMultiRedeem", "Enabled", "Note", "CreatedBy", "CreatedAt", "UpdatedAt").
		Create(&item).Error; err != nil {
		if isUniqueViolation(err) {
			return data.RedeemCode{}, errors.New("redeem code already exists")
		}
		return data.RedeemCode{}, err
	}
	item.Group = group
	return item, nil
}

func (s *Service) Update(ctx context.Context, actor data.User, id uint, input UpdateInput) (data.RedeemCode, error) {
	if !actor.IsAdmin {
		return data.RedeemCode{}, ErrAdminRequired
	}
	item, err := s.Get(ctx, id)
	if err != nil {
		return data.RedeemCode{}, err
	}

	updates := map[string]interface{}{}
	rewardType := item.RewardType
	if input.RewardType != nil {
		rt := strings.ToLower(strings.TrimSpace(*input.RewardType))
		if rt != RewardTypeGroup && rt != RewardTypeCapacity {
			return data.RedeemCode{}, ErrInvalidReward
		}
		updates["reward_type"] = rt
		rewardType = rt
	}
	if input.GroupID != nil {
		if *input.GroupID == 0 {
			updates["group_id"] = nil
			item.GroupID = nil
			item.Group = nil
		} else {
			var group data.Group
			if err := s.db.WithContext(ctx).First(&group, *input.GroupID).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return data.RedeemCode{}, ErrGroupNotFound
				}
				return data.RedeemCode{}, err
			}
			updates["group_id"] = *input.GroupID
			item.Group = &group
			item.GroupID = input.GroupID
		}
	}
	if input.CapacityDelta != nil {
		updates["capacity_delta"] = *input.CapacityDelta
		item.CapacityDelta = *input.CapacityDelta
	}
	if input.MaxUses != nil {
		maxUses := *input.MaxUses
		if maxUses < 0 {
			maxUses = 0
		}
		if maxUses > 0 && maxUses < item.UsedCount {
			return data.RedeemCode{}, fmt.Errorf("max uses cannot be less than current used count (%d)", item.UsedCount)
		}
		updates["max_uses"] = maxUses
		item.MaxUses = maxUses
	}
	if input.AllowMultiRedeem != nil {
		updates["allow_multi_redeem"] = *input.AllowMultiRedeem
		item.AllowMultiRedeem = *input.AllowMultiRedeem
	}
	if input.Enabled != nil {
		updates["enabled"] = *input.Enabled
		item.Enabled = *input.Enabled
	}
	if input.Note != nil {
		note := strings.TrimSpace(*input.Note)
		updates["note"] = note
		item.Note = note
	}

	// 校验最终奖励配置
	finalDelta := item.CapacityDelta
	if input.CapacityDelta != nil {
		finalDelta = *input.CapacityDelta
	}
	finalGroupID := item.GroupID
	if rewardType == RewardTypeGroup {
		if finalGroupID == nil || *finalGroupID == 0 {
			return data.RedeemCode{}, ErrGroupNotFound
		}
	} else if finalDelta == 0 {
		return data.RedeemCode{}, ErrInvalidReward
	}

	if len(updates) == 0 {
		return item, nil
	}
	if err := s.db.WithContext(ctx).Model(&data.RedeemCode{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return data.RedeemCode{}, err
	}
	return s.Get(ctx, id)
}

func (s *Service) Delete(ctx context.Context, actor data.User, id uint) error {
	if !actor.IsAdmin {
		return ErrAdminRequired
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("redeem_code_id = ?", id).Delete(&data.RedeemCodeUsage{}).Error; err != nil {
			return err
		}
		res := tx.Delete(&data.RedeemCode{}, id)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrCodeNotFound
		}
		return nil
	})
}

func (s *Service) Redeem(ctx context.Context, user data.User, rawCode string) (RedeemResult, error) {
	code := normalizeCode(rawCode)
	if code == "" {
		return RedeemResult{}, ErrInvalidCode
	}

	var result RedeemResult
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item data.RedeemCode
		if err := tx.Where("code = ?", code).First(&item).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrCodeNotFound
			}
			return err
		}
		if !item.Enabled {
			return ErrCodeDisabled
		}

		if !item.AllowMultiRedeem {
			var count int64
			if err := tx.Model(&data.RedeemCodeUsage{}).
				Where("redeem_code_id = ? AND user_id = ?", item.ID, user.ID).
				Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				return ErrAlreadyRedeemed
			}
		}

		if item.MaxUses > 0 && item.UsedCount >= item.MaxUses {
			return ErrCodeExhausted
		}

		rewardType := strings.ToLower(strings.TrimSpace(item.RewardType))
		if rewardType == "" {
			rewardType = RewardTypeGroup
		}

		var group *data.Group
		if rewardType == RewardTypeGroup {
			if item.GroupID == nil {
				return ErrGroupNotFound
			}
			var g data.Group
			if err := tx.First(&g, *item.GroupID).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrGroupNotFound
				}
				return err
			}
			group = &g
		} else if item.CapacityDelta == 0 {
			return ErrInvalidReward
		}

		// 原子递增 used_count，并在有上限时再次校验
		q := tx.Model(&data.RedeemCode{}).Where("id = ? AND enabled = ?", item.ID, true)
		if item.MaxUses > 0 {
			q = q.Where("used_count < ?", item.MaxUses)
		}
		res := q.UpdateColumn("used_count", gorm.Expr("used_count + 1"))
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrCodeExhausted
		}

		usage := data.RedeemCodeUsage{
			RedeemCodeID: item.ID,
			UserID:       user.ID,
			CreatedAt:    time.Now(),
		}
		if err := tx.Create(&usage).Error; err != nil {
			return err
		}

		if rewardType == RewardTypeGroup {
			if err := tx.Model(&data.User{}).
				Where("id = ?", user.ID).
				Update("group_id", item.GroupID).Error; err != nil {
				return err
			}
		} else {
			if err := tx.Model(&data.User{}).
				Where("id = ?", user.ID).
				UpdateColumn("capacity_bonus", gorm.Expr("capacity_bonus + ?", item.CapacityDelta)).Error; err != nil {
				return err
			}
		}

		if err := tx.Preload("Group").First(&item, item.ID).Error; err != nil {
			return err
		}

		var updatedUser data.User
		if err := tx.Preload("Group").First(&updatedUser, user.ID).Error; err != nil {
			return err
		}
		result = RedeemResult{
			User:  updatedUser,
			Code:  item,
			Group: group,
		}
		return nil
	})
	return result, err
}

func normalizeCode(code string) string {
	code = strings.TrimSpace(code)
	code = strings.ToUpper(code)
	code = strings.ReplaceAll(code, " ", "")
	return code
}

func generateCode() (string, error) {
	// 5 段 × 5 字符，约 25 位，排除易混字符
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	const segments = 5
	const segmentLen = 5
	parts := make([]string, segments)
	for i := 0; i < segments; i++ {
		buf := make([]byte, segmentLen)
		for j := 0; j < segmentLen; j++ {
			n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
			if err != nil {
				return "", err
			}
			buf[j] = alphabet[n.Int64()]
		}
		parts[i] = string(buf)
	}
	return strings.Join(parts, "-"), nil
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique") ||
		strings.Contains(msg, "duplicate") ||
		strings.Contains(msg, "constraint")
}
