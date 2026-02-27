package legacy

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"gorm.io/datatypes"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"skyimage/internal/data"
)

type Importer struct {
	legacy       *gorm.DB
	target       *gorm.DB
	legacyRoot   string
	newStorage   string
	copiedFiles  int
	skippedFiles int
}

func NewImporter(legacyDSN string, target *gorm.DB, legacyRoot, newStorage string) (*Importer, error) {
	legacyDB, err := gorm.Open(mysql.Open(legacyDSN), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("connect legacy db: %w", err)
	}
	return &Importer{
		legacy:     legacyDB,
		target:     target,
		legacyRoot: legacyRoot,
		newStorage: newStorage,
	}, nil
}

func (i *Importer) Run(ctx context.Context) error {
	if err := i.importGroups(ctx); err != nil {
		return err
	}
	if err := i.importUsers(ctx); err != nil {
		return err
	}
	if err := i.importImages(ctx); err != nil {
		return err
	}
	return nil
}

func (i *Importer) Stats() (int, int) {
	return i.copiedFiles, i.skippedFiles
}

type legacyGroup struct {
	ID        uint
	Name      string
	IsDefault bool `gorm:"column:is_default"`
	IsGuest   bool `gorm:"column:is_guest"`
	Configs   []byte
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (i *Importer) importGroups(ctx context.Context) error {
	var groups []legacyGroup
	if err := i.legacy.WithContext(ctx).Table("groups").Find(&groups).Error; err != nil {
		return err
	}
	for _, g := range groups {
		group := data.Group{
			ID:        g.ID,
			Name:      g.Name,
			IsDefault: g.IsDefault,
			IsGuest:   g.IsGuest,
			Configs:   datatypes.JSON(g.Configs),
			CreatedAt: g.CreatedAt,
			UpdatedAt: g.UpdatedAt,
		}
		if err := i.target.Clauses(clause.OnConflict{
			UpdateAll: true,
		}).Create(&group).Error; err != nil {
			return err
		}
	}
	return nil
}

type legacyUser struct {
	ID            uint
	GroupID       *uint
	Name          string
	Email         string
	Password      string
	URL           string
	Capacity      float64
	Configs       []byte
	IsAdmin       bool       `gorm:"column:is_adminer"`
	Status        uint8      `gorm:"column:status"`
	RegisteredIP  string     `gorm:"column:registered_ip"`
	ImageNum      uint64     `gorm:"column:image_num"`
	AlbumNum      uint64     `gorm:"column:album_num"`
	EmailVerified *time.Time `gorm:"column:email_verified_at"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (i *Importer) importUsers(ctx context.Context) error {
	var users []legacyUser
	if err := i.legacy.WithContext(ctx).Table("users").Find(&users).Error; err != nil {
		return err
	}
	for _, u := range users {
		user := data.User{
			ID:            u.ID,
			GroupID:       u.GroupID,
			Name:          u.Name,
			Email:         u.Email,
			PasswordHash:  u.Password,
			URL:           u.URL,
			Capacity:      u.Capacity,
			Configs:       datatypes.JSON(u.Configs),
			IsAdmin:       u.IsAdmin,
			Status:        u.Status,
			RegisteredIP:  u.RegisteredIP,
			ImageCount:    u.ImageNum,
			AlbumCount:    u.AlbumNum,
			EmailVerified: u.EmailVerified,
			CreatedAt:     u.CreatedAt,
			UpdatedAt:     u.UpdatedAt,
		}
		if err := i.target.Clauses(clause.OnConflict{
			UpdateAll: true,
		}).Create(&user).Error; err != nil {
			return err
		}
	}
	return nil
}

type legacyImage struct {
	ID         uint
	UserID     uint
	GroupID    *uint
	Key        string
	Path       string
	Name       string
	OriginName string  `gorm:"column:origin_name"`
	SizeKB     float64 `gorm:"column:size"`
	Mimetype   string  `gorm:"column:mimetype"`
	Extension  string  `gorm:"column:extension"`
	MD5        string  `gorm:"column:md5"`
	SHA1       string  `gorm:"column:sha1"`
	Permission int     `gorm:"column:permission"`
	UploadedIP string  `gorm:"column:uploaded_ip"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (i *Importer) importImages(ctx context.Context) error {
	var images []legacyImage
	if err := i.legacy.WithContext(ctx).Table("images").Find(&images).Error; err != nil {
		return err
	}
	for _, img := range images {
		if err := i.importImage(ctx, img); err != nil {
			return err
		}
	}
	return nil
}

func (i *Importer) importImage(ctx context.Context, img legacyImage) error {
	destPath := filepath.Join(i.newStorage, "imported")
	if err := os.MkdirAll(destPath, 0o755); err != nil {
		return err
	}
	filename := fmt.Sprintf("%s.%s", img.Key, img.Extension)
	targetPath := filepath.Join(destPath, filename)

	srcPath := img.Path
	if !filepath.IsAbs(srcPath) {
		srcPath = filepath.Join(i.legacyRoot, srcPath)
	}
	if err := copyIfExists(srcPath, targetPath); err != nil {
		i.skippedFiles++
		targetPath = srcPath
	} else {
		i.copiedFiles++
	}

	file := data.FileAsset{
		ID:           img.ID,
		UserID:       img.UserID,
		GroupID:      img.GroupID,
		Key:          img.Key,
		Path:         targetPath,
		Name:         filename,
		OriginalName: img.OriginName,
		Size:         int64(img.SizeKB * 1024),
		MimeType:     img.Mimetype,
		Extension:    img.Extension,
		ChecksumMD5:  img.MD5,
		ChecksumSHA1: img.SHA1,
		Visibility:   mapPermission(img.Permission),
		UploadedIP:   img.UploadedIP,
		CreatedAt:    img.CreatedAt,
		UpdatedAt:    img.UpdatedAt,
	}
	return i.target.Clauses(clause.OnConflict{
		UpdateAll: true,
	}).Create(&file).Error
}

func copyIfExists(src, dest string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	destFile, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, srcFile)
	return err
}

func mapPermission(p int) string {
	if p == 1 {
		return "public"
	}
	return "private"
}
