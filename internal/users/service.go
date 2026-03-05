package users

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"os"
	"strconv"

	"skyimage/internal/data"
)

type Service struct {
	db *gorm.DB
}

var (
	ErrSuperAdminImmutable = errors.New("cannot modify super admin")
	ErrInvalidEmail        = errors.New("invalid email format")
	ErrWeakPassword        = errors.New("password must be at least 8 characters and contain uppercase, lowercase, and numbers")
)

// 邮箱验证正则表达式
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

func New(db *gorm.DB) *Service {
	return &Service{
		db: db,
	}
}

type RegisterInput struct {
	Name         string `json:"name"`
	Email        string `json:"email"`
	Password     string `json:"password"`
	RegisteredIP string `json:"-"` // 不从JSON读取，由服务器设置
}

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type CreateUserInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

type ProfileUpdateInput struct {
	Name              string `json:"name"`
	URL               string `json:"url"`
	Password          string `json:"password"`
	DefaultVisibility string `json:"defaultVisibility"`
	ThemePreference   string `json:"theme"`
}

// validateEmail 验证邮箱格式
func validateEmail(email string) error {
	email = strings.TrimSpace(email)
	if email == "" || len(email) > 255 {
		return ErrInvalidEmail
	}
	if !emailRegex.MatchString(email) {
		return ErrInvalidEmail
	}
	return nil
}

// validatePassword 验证密码强度
func validatePassword(password string) error {
	if len(password) < 8 {
		return ErrWeakPassword
	}
	
	var (
		hasUpper   bool
		hasLower   bool
		hasNumber  bool
	)
	
	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsNumber(char):
			hasNumber = true
		}
	}
	
	if !hasUpper || !hasLower || !hasNumber {
		return ErrWeakPassword
	}
	
	return nil
}

func (s *Service) Register(ctx context.Context, in RegisterInput) (data.User, error) {
	// 验证邮箱格式
	if err := validateEmail(in.Email); err != nil {
		return data.User{}, err
	}
	
	// 验证密码强度
	if err := validatePassword(in.Password); err != nil {
		return data.User{}, err
	}
	
	// 标准化邮箱（转小写）
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	
	hashed, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return data.User{}, err
	}
	user := data.User{
		Name:         in.Name,
		Email:        in.Email,
		PasswordHash: string(hashed),
		Configs:      datatypes.JSON([]byte(`{}`)),
		Status:       1,
		RegisteredIP: in.RegisteredIP,
	}
	if group, err := s.defaultGroup(ctx); err == nil && group != nil {
		user.GroupID = &group.ID
	}
	if err := s.db.WithContext(ctx).Create(&user).Error; err != nil {
		return data.User{}, err
	}
	_ = s.hydrateUser(ctx, &user)
	return user, nil
}

func (s *Service) Login(ctx context.Context, in LoginInput) (data.User, error) {
	// 验证邮箱格式
	if err := validateEmail(in.Email); err != nil {
		return data.User{}, errors.New("invalid credentials")
	}
	
	// 标准化邮箱（转小写）
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	
	var user data.User
	// 使用参数化查询防止 SQL 注入
	if err := s.db.WithContext(ctx).Preload("Group").Where("LOWER(email) = ?", in.Email).First(&user).Error; err != nil {
		// 统一返回"邮箱/密码不正确"，不暴露用户是否存在
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return data.User{}, errors.New("invalid credentials")
		}
		return data.User{}, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(in.Password)); err != nil {
		return data.User{}, errors.New("invalid credentials")
	}
	if user.Status == 0 {
		return data.User{}, errors.New("account disabled")
	}
	_ = s.hydrateUser(ctx, &user)
	return user, nil
}

func (s *Service) List(ctx context.Context) ([]data.User, error) {
	var users []data.User
	err := s.db.WithContext(ctx).
		Preload("Group").
		Order("created_at DESC").
		Find(&users).Error
	if err != nil {
		return nil, err
	}
	for i := range users {
		_ = s.hydrateUser(ctx, &users[i])
	}
	return users, nil
}

func (s *Service) HasUsers(ctx context.Context) (bool, error) {
	var count int64
	if err := s.db.WithContext(ctx).Model(&data.User{}).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Service) FindByID(ctx context.Context, id uint) (data.User, error) {
	var user data.User
	err := s.db.WithContext(ctx).Preload("Group").First(&user, id).Error
	if err != nil {
		return user, err
	}
	_ = s.hydrateUser(ctx, &user)
	return user, nil
}

func (s *Service) UpdateStatus(ctx context.Context, actor data.User, userID uint, status uint8) error {
	if !actor.IsAdmin {
		return errors.New("admin required")
	}
	if actor.ID == userID {
		return errors.New("cannot change your own status")
	}
	target, err := s.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	if target.IsSuperAdmin {
		return ErrSuperAdminImmutable
	}
	return s.db.WithContext(ctx).Model(&data.User{}).
		Where("id = ?", userID).
		Update("status", status).Error
}

func (s *Service) ToggleAdmin(ctx context.Context, actor data.User, userID uint, isAdmin bool) error {
	if !actor.IsAdmin {
		return errors.New("admin required")
	}
	if actor.ID == userID {
		return errors.New("cannot change your own role")
	}
	target, err := s.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	if target.IsSuperAdmin {
		return ErrSuperAdminImmutable
	}
	return s.db.WithContext(ctx).Model(&data.User{}).
		Where("id = ?", userID).
		Update("is_adminer", isAdmin).Error
}

func (s *Service) CreateUser(ctx context.Context, actor data.User, input CreateUserInput) (data.User, error) {
	if !actor.IsAdmin {
		return data.User{}, errors.New("admin required")
	}
	
	// 验证邮箱格式
	if err := validateEmail(input.Email); err != nil {
		return data.User{}, err
	}
	
	// 验证密码强度
	if err := validatePassword(input.Password); err != nil {
		return data.User{}, err
	}
	
	// 标准化邮箱（转小写）
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	
	role := strings.ToLower(strings.TrimSpace(input.Role))
	if role != "admin" && role != "user" {
		return data.User{}, errors.New("role must be admin or user")
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return data.User{}, err
	}
	user := data.User{
		Name:         input.Name,
		Email:        input.Email,
		PasswordHash: string(hashed),
		IsAdmin:      role == "admin",
		Status:       1,
		Configs:      datatypes.JSON([]byte(`{}`)),
	}
	if group, err := s.defaultGroup(ctx); err == nil && group != nil {
		user.GroupID = &group.ID
	}
	if err := s.db.WithContext(ctx).Create(&user).Error; err != nil {
		return data.User{}, err
	}
	_ = s.hydrateUser(ctx, &user)
	return user, nil
}

func (s *Service) DeleteUser(ctx context.Context, actor data.User, userID uint) error {
	if !actor.IsAdmin {
		return errors.New("admin required")
	}
	if actor.ID == userID {
		return errors.New("cannot delete yourself")
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user data.User
		if err := tx.First(&user, userID).Error; err != nil {
			return err
		}
		if user.IsSuperAdmin {
			return ErrSuperAdminImmutable
		}
		var assets []data.FileAsset
		if err := tx.Where("user_id = ?", user.ID).Find(&assets).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", user.ID).Delete(&data.FileAsset{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&data.User{}, user.ID).Error; err != nil {
			return err
		}
		for _, asset := range assets {
			_ = os.Remove(asset.Path)
		}
		return nil
	})
}

func (s *Service) UpdateProfile(ctx context.Context, userID uint, input ProfileUpdateInput) (data.User, error) {
	var user data.User
	if err := s.db.WithContext(ctx).First(&user, userID).Error; err != nil {
		return data.User{}, err
	}
	updates := map[string]interface{}{
		"name": input.Name,
		"url":  input.URL,
	}
	if strings.TrimSpace(input.Password) != "" {
		// 验证新密码强度
		if err := validatePassword(input.Password); err != nil {
			return data.User{}, err
		}
		hashed, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			return data.User{}, err
		}
		updates["password"] = string(hashed)
	}
	// Parse existing configs
	cfg := map[string]interface{}{}
	if len(user.Configs) > 0 {
		_ = json.Unmarshal(user.Configs, &cfg)
	}

	// Update default visibility if provided
	if strings.TrimSpace(input.DefaultVisibility) != "" {
		cfg["default_visibility"] = NormalizeVisibility(input.DefaultVisibility)
	}

	// Update theme preference if provided
	if strings.TrimSpace(input.ThemePreference) != "" {
		theme := strings.ToLower(strings.TrimSpace(input.ThemePreference))
		if theme != "light" && theme != "dark" {
			theme = "system"
		}
		cfg["theme_preference"] = theme
	}

	// Marshal updated configs
	configBytes, _ := json.Marshal(cfg)
	configs := datatypes.JSON(configBytes)

	if !bytes.Equal(configs, user.Configs) {
		updates["configs"] = configs
	}
	if err := s.db.WithContext(ctx).Model(&data.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
		return data.User{}, err
	}
	return s.FindByID(ctx, userID)
}

func (s *Service) AssignGroup(ctx context.Context, actor data.User, userID uint, groupID *uint) (data.User, error) {
	if !actor.IsAdmin {
		return data.User{}, errors.New("admin required")
	}
	target, err := s.FindByID(ctx, userID)
	if err != nil {
		return data.User{}, err
	}
	var group *data.Group
	if groupID != nil {
		var g data.Group
		if err := s.db.WithContext(ctx).First(&g, *groupID).Error; err != nil {
			return data.User{}, err
		}
		group = &g
	}
	if err := s.db.WithContext(ctx).Model(&data.User{}).
		Where("id = ?", userID).
		Update("group_id", groupID).Error; err != nil {
		return data.User{}, err
	}
	if group != nil {
		target.Group = *group
		target.GroupID = groupID
	} else {
		target.Group = data.Group{}
		target.GroupID = nil
	}
	_ = s.hydrateUser(ctx, &target)
	return target, nil
}

func (s *Service) defaultGroup(ctx context.Context) (*data.Group, error) {
	var group data.Group
	if err := s.db.WithContext(ctx).
		Where("is_default = ?", true).
		First(&group).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &group, nil
}

func (s *Service) hydrateUser(ctx context.Context, user *data.User) error {
	if user == nil {
		return nil
	}
	if user.GroupID != nil && user.Group.ID == 0 {
		if err := s.db.WithContext(ctx).First(&user.Group, *user.GroupID).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}
	}
	if user.GroupID == nil {
		user.Capacity = 0
		return nil
	}
	user.Capacity = groupCapacity(user.Group)
	return nil
}

func groupCapacity(group data.Group) float64 {
	if len(group.Configs) == 0 {
		return 0
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(group.Configs, &cfg); err != nil {
		return 0
	}
	if raw, ok := cfg["max_capacity"]; ok {
		switch val := raw.(type) {
		case float64:
			return val
		case int:
			return float64(val)
		case string:
			if parsed, err := strconv.ParseFloat(val, 64); err == nil {
				return parsed
			}
		}
	}
	return 0
}
