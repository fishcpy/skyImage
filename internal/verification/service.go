package verification

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"sync"
	"time"
)

type Service struct {
	codes sync.Map // key: email, value: *CodeEntry
}

type CodeEntry struct {
	Code      string
	ExpiresAt time.Time
	Attempts  int
}

func New() *Service {
	return &Service{}
}

// GenerateCode 生成6位数字验证码
func (s *Service) GenerateCode() string {
	code := ""
	for i := 0; i < 6; i++ {
		n, _ := rand.Int(rand.Reader, big.NewInt(10))
		code += fmt.Sprintf("%d", n.Int64())
	}
	return code
}

// StoreCode 存储验证码，有效期5分钟
func (s *Service) StoreCode(email, code string) {
	s.codes.Store(email, &CodeEntry{
		Code:      code,
		ExpiresAt: time.Now().Add(5 * time.Minute),
		Attempts:  0,
	})
}

// VerifyCode 验证验证码
func (s *Service) VerifyCode(email, code string) (bool, error) {
	value, ok := s.codes.Load(email)
	if !ok {
		return false, fmt.Errorf("验证码不存在或已过期")
	}

	entry := value.(*CodeEntry)

	// 检查是否过期
	if time.Now().After(entry.ExpiresAt) {
		s.codes.Delete(email)
		return false, fmt.Errorf("验证码已过期")
	}

	// 检查尝试次数
	if entry.Attempts >= 5 {
		s.codes.Delete(email)
		return false, fmt.Errorf("验证码尝试次数过多")
	}

	entry.Attempts++

	// 验证码错误
	if entry.Code != code {
		return false, fmt.Errorf("验证码错误")
	}

	// 验证成功，删除验证码
	s.codes.Delete(email)
	return true, nil
}

// CleanExpired 清理过期的验证码（定期调用）
func (s *Service) CleanExpired(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now()
			s.codes.Range(func(key, value interface{}) bool {
				entry := value.(*CodeEntry)
				if now.After(entry.ExpiresAt) {
					s.codes.Delete(key)
				}
				return true
			})
		}
	}
}
