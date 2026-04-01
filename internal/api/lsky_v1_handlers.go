package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"skyimage/internal/data"
	"skyimage/internal/files"
	"skyimage/internal/middleware"
	"skyimage/internal/turnstile"
	"skyimage/internal/users"
)

// LskyV1Handler Lsky v2 API 兼容处理器
type LskyV1Handler struct {
	db          *gorm.DB
	userService *users.Service
	fileService *files.Service
	authLimiter *requestLimiter
	turnstile   *turnstile.Service
}

func NewLskyV1Handler(db *gorm.DB, userService *users.Service, fileService *files.Service, authLimiter *requestLimiter, turnstileSvc *turnstile.Service) *LskyV1Handler {
	return &LskyV1Handler{
		db:          db,
		userService: userService,
		fileService: fileService,
		authLimiter: authLimiter,
		turnstile:   turnstileSvc,
	}
}

// 生成 Token
func (h *LskyV1Handler) CreateToken(c *gin.Context) {
	var req struct {
		Email          string `json:"email" binding:"required"`
		Password       string `json:"password" binding:"required"`
		TurnstileToken string `json:"turnstileToken"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  false,
			"message": "Invalid request parameters",
			"data":    gin.H{},
		})
		return
	}

	clientIP := c.ClientIP()
	emailKey := strings.ToLower(strings.TrimSpace(req.Email))
	if h.authLimiter != nil {
		if ok, retry := h.authLimiter.Allow("v1token:ip:"+clientIP, 20, time.Minute); !ok {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"status":  false,
				"message": fmt.Sprintf("Too many requests, retry in %d seconds", int(retry.Seconds())+1),
				"data":    gin.H{},
			})
			return
		}
		if emailKey != "" {
			if ok, retry := h.authLimiter.Allow("v1token:email:"+emailKey, 10, time.Minute); !ok {
				c.JSON(http.StatusTooManyRequests, gin.H{
					"status":  false,
					"message": fmt.Sprintf("Too many attempts for this account, retry in %d seconds", int(retry.Seconds())+1),
					"data":    gin.H{},
				})
				return
			}
		}
	}

	if h.turnstile != nil {
		enabled, err := h.turnstile.IsEnabled(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"status":  false,
				"message": "Failed to check turnstile status",
				"data":    gin.H{},
			})
			return
		}
		if enabled {
			turnstileToken := strings.TrimSpace(req.TurnstileToken)
			if turnstileToken == "" {
				turnstileToken = strings.TrimSpace(c.GetHeader("Cf-Turnstile-Token"))
			}
			if turnstileToken == "" {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  false,
					"message": "Turnstile token required",
					"data":    gin.H{},
				})
				return
			}
			valid, err := h.turnstile.Verify(c.Request.Context(), turnstileToken, clientIP)
			if err != nil || !valid {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  false,
					"message": "Turnstile verification failed",
					"data":    gin.H{},
				})
				return
			}
		}
	}

	// 验证用户
	user, err := h.userService.Login(c.Request.Context(), users.LoginInput{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"status":  false,
			"message": "Invalid credentials",
			"data":    gin.H{},
		})
		return
	}

	tokenStr, err := data.GenerateAPIToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  false,
			"message": "Failed to generate token",
			"data":    gin.H{},
		})
		return
	}

	apiToken := data.ApiToken{
		UserID:    user.ID,
		Token:     data.HashAPIToken(tokenStr),
		ExpiresAt: data.NewNeverExpireTime(),
	}
	if err := h.db.Create(&apiToken).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  false,
			"message": "Failed to create token",
			"data":    gin.H{},
		})
		return
	}

	c.Header("X-RateLimit-Limit", "60")
	c.Header("X-RateLimit-Remaining", "59")

	c.JSON(http.StatusOK, gin.H{
		"status":  true,
		"message": "Token created successfully",
		"data": gin.H{
			"token": tokenStr,
		},
	})
}

// 清空 Token
func (h *LskyV1Handler) DeleteTokens(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"status":  false,
			"message": "Unauthorized",
			"data":    gin.H{},
		})
		return
	}

	if err := h.db.Where("user_id = ?", user.ID).Delete(&data.ApiToken{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  false,
			"message": "Failed to delete tokens",
			"data":    gin.H{},
		})
		return
	}

	c.Header("X-RateLimit-Limit", "60")
	c.Header("X-RateLimit-Remaining", "59")

	c.JSON(http.StatusOK, gin.H{
		"status":  true,
		"message": "Tokens deleted successfully",
		"data":    gin.H{},
	})
}

// 用户资料
func (h *LskyV1Handler) GetProfile(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"status":  false,
			"message": "Unauthorized",
			"data":    gin.H{},
		})
		return
	}

	c.Header("X-RateLimit-Limit", "60")
	c.Header("X-RateLimit-Remaining", "59")

	c.JSON(http.StatusOK, gin.H{
		"status":  true,
		"message": "Success",
		"data": gin.H{
			"name":          user.Name,
			"avatar":        "",
			"email":         user.Email,
			"capacity":      user.Capacity,
			"used_capacity": user.UsedCapacity,
			"url":           user.URL,
			"image_num":     user.ImageCount,
			"album_num":     user.AlbumCount,
			"registered_ip": user.RegisteredIP,
		},
	})
}

// 策略列表
func (h *LskyV1Handler) GetStrategies(c *gin.Context) {
	keyword := c.Query("keyword")

	var strategies []data.Strategy
	query := h.db.Model(&data.Strategy{})
	if keyword != "" {
		query = query.Where("name LIKE ?", "%"+keyword+"%")
	}

	if err := query.Find(&strategies).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  false,
			"message": "Failed to fetch strategies",
			"data":    gin.H{},
		})
		return
	}

	var result []gin.H
	for _, s := range strategies {
		result = append(result, gin.H{
			"id":   s.ID,
			"name": s.Name,
		})
	}

	c.Header("X-RateLimit-Limit", "60")
	c.Header("X-RateLimit-Remaining", "59")

	c.JSON(http.StatusOK, gin.H{
		"status":  true,
		"message": "Success",
		"data": gin.H{
			"strategies": result,
		},
	})
}

// 上传图片
func (h *LskyV1Handler) UploadImage(c *gin.Context) {
	// 获取当前用户（可能是游客）
	user, authenticated := middleware.CurrentUser(c)

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  false,
			"message": "No file uploaded",
			"data":    gin.H{},
		})
		return
	}

	strategyIDStr := c.PostForm("strategy_id")
	var strategyID uint
	if strategyIDStr != "" {
		if id, err := strconv.ParseUint(strategyIDStr, 10, 32); err == nil {
			strategyID = uint(id)
		}
	}

	// 如果未认证，使用游客上传逻辑
	if !authenticated {
		// 查找游客组
		var guestGroup data.Group
		if err := h.db.Where("is_guest = ?", true).First(&guestGroup).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"status":  false,
				"message": "Guest upload not allowed",
				"data":    gin.H{},
			})
			return
		}
		user.GroupID = &guestGroup.ID
		user.Group = guestGroup
	}

	// 兼容 Lsky v2：上传可见性遵循用户个人设置中的默认上传可见性。
	visibility := users.DefaultVisibility(user)

	// 使用文件服务上传
	asset, err := h.fileService.Upload(c.Request.Context(), user, file, files.UploadOptions{
		StrategyID: strategyID,
		Visibility: visibility,
	})
	if err != nil {
		c.JSON(statusCodeFromError(err, http.StatusInternalServerError), gin.H{
			"status":  false,
			"message": err.Error(),
			"data":    gin.H{},
		})
		return
	}

	// 构建公开链接（不再使用历史 /f/{key} 路径）
	imageURL := h.resolveAssetPublicURL(c, asset)
	if imageURL == "" {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  false,
			"message": "Failed to resolve image URL",
			"data":    gin.H{},
		})
		return
	}
	thumbnailURL := imageURL

	c.Header("X-RateLimit-Limit", "60")
	c.Header("X-RateLimit-Remaining", "59")

	c.JSON(http.StatusOK, gin.H{
		"status":  true,
		"message": "Upload successful",
		"data": gin.H{
			"key":         asset.Key,
			"name":        asset.Name,
			"pathname":    asset.RelativePath,
			"origin_name": asset.OriginalName,
			"size":        float64(asset.Size) / 1024,
			"mimetype":    asset.MimeType,
			"extension":   asset.Extension,
			"md5":         asset.ChecksumMD5,
			"sha1":        asset.ChecksumSHA1,
			"links": gin.H{
				"url":                imageURL,
				"html":               fmt.Sprintf(`<img src="%s" alt="%s" />`, imageURL, asset.Name),
				"bbcode":             fmt.Sprintf(`[img]%s[/img]`, imageURL),
				"markdown":           fmt.Sprintf(`![%s](%s)`, asset.Name, imageURL),
				"markdown_with_link": fmt.Sprintf(`[![%s](%s)](%s)`, asset.Name, imageURL, imageURL),
				"thumbnail_url":      thumbnailURL,
			},
		},
	})
}

// 图片列表
func (h *LskyV1Handler) GetImages(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"status":  false,
			"message": "Unauthorized",
			"data":    gin.H{},
		})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	perPage := 15

	order := c.Query("order")
	permission := c.Query("permission")
	keyword := c.Query("keyword")

	query := h.db.Model(&data.FileAsset{}).Where("user_id = ?", user.ID)

	if permission == "public" {
		query = query.Where("visibility = ?", "public")
	} else if permission == "private" {
		query = query.Where("visibility = ?", "private")
	}

	if keyword != "" {
		query = query.Where("name LIKE ? OR original_name LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}

	switch order {
	case "earliest":
		query = query.Order("created_at ASC")
	case "utmost":
		query = query.Order("size DESC")
	case "least":
		query = query.Order("size ASC")
	default:
		query = query.Order("created_at DESC")
	}

	var total int64
	query.Count(&total)

	var images []data.FileAsset
	offset := (page - 1) * perPage
	if err := query.Offset(offset).Limit(perPage).Find(&images).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  false,
			"message": "Failed to fetch images",
			"data":    gin.H{},
		})
		return
	}

	var result []gin.H
	for _, img := range images {
		imageURL := h.resolveAssetPublicURL(c, img)
		result = append(result, gin.H{
			"key":         img.Key,
			"name":        img.Name,
			"origin_name": img.OriginalName,
			"pathname":    img.RelativePath,
			"size":        float64(img.Size) / 1024,
			"width":       img.Width,
			"height":      img.Height,
			"md5":         img.ChecksumMD5,
			"sha1":        img.ChecksumSHA1,
			"human_date":  formatHumanDate(img.CreatedAt),
			"date":        img.CreatedAt.Format("2006-01-02 15:04:05"),
			"links": gin.H{
				"url":                imageURL,
				"html":               fmt.Sprintf(`<img src="%s" alt="%s" />`, imageURL, img.Name),
				"bbcode":             fmt.Sprintf(`[img]%s[/img]`, imageURL),
				"markdown":           fmt.Sprintf(`![%s](%s)`, img.Name, imageURL),
				"markdown_with_link": fmt.Sprintf(`[![%s](%s)](%s)`, img.Name, imageURL, imageURL),
				"thumbnail_url":      imageURL,
			},
		})
	}

	lastPage := int((total + int64(perPage) - 1) / int64(perPage))

	c.Header("X-RateLimit-Limit", "60")
	c.Header("X-RateLimit-Remaining", "59")

	c.JSON(http.StatusOK, gin.H{
		"status":  true,
		"message": "Success",
		"data": gin.H{
			"current_page": page,
			"last_page":    lastPage,
			"per_page":     perPage,
			"total":        total,
			"data":         result,
		},
	})
}

// 删除图片
func (h *LskyV1Handler) DeleteImage(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"status":  false,
			"message": "Unauthorized",
			"data":    gin.H{},
		})
		return
	}

	key := c.Param("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  false,
			"message": "Missing image key",
			"data":    gin.H{},
		})
		return
	}

	var asset data.FileAsset
	if err := h.db.Where("key = ? AND user_id = ?", key, user.ID).First(&asset).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"status":  false,
			"message": "Image not found",
			"data":    gin.H{},
		})
		return
	}

	if err := h.fileService.Delete(c.Request.Context(), asset.ID, user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  false,
			"message": err.Error(),
			"data":    gin.H{},
		})
		return
	}

	c.Header("X-RateLimit-Limit", "60")
	c.Header("X-RateLimit-Remaining", "59")

	c.JSON(http.StatusOK, gin.H{
		"status":  true,
		"message": "Image deleted successfully",
		"data":    gin.H{},
	})
}

// 相册列表
func (h *LskyV1Handler) GetAlbums(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"status":  false,
			"message": "Unauthorized",
			"data":    gin.H{},
		})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	perPage := 15

	order := c.Query("order")
	keyword := c.Query("keyword")

	query := h.db.Model(&data.Album{}).Where("user_id = ?", user.ID)

	if keyword != "" {
		query = query.Where("name LIKE ?", "%"+keyword+"%")
	}

	switch order {
	case "earliest":
		query = query.Order("created_at ASC")
	case "most":
		query = query.Order("image_num DESC")
	case "least":
		query = query.Order("image_num ASC")
	default:
		query = query.Order("created_at DESC")
	}

	var total int64
	query.Count(&total)

	var albums []data.Album
	offset := (page - 1) * perPage
	if err := query.Offset(offset).Limit(perPage).Find(&albums).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  false,
			"message": "Failed to fetch albums",
			"data":    gin.H{},
		})
		return
	}

	var result []gin.H
	for _, album := range albums {
		result = append(result, gin.H{
			"id":        album.ID,
			"name":      album.Name,
			"intro":     album.Intro,
			"image_num": album.ImageNum,
		})
	}

	lastPage := int((total + int64(perPage) - 1) / int64(perPage))

	c.Header("X-RateLimit-Limit", "60")
	c.Header("X-RateLimit-Remaining", "59")

	c.JSON(http.StatusOK, gin.H{
		"status":  true,
		"message": "Success",
		"data": gin.H{
			"current_page": page,
			"last_page":    lastPage,
			"per_page":     perPage,
			"total":        total,
			"data":         result,
		},
	})
}

// 删除相册
func (h *LskyV1Handler) DeleteAlbum(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"status":  false,
			"message": "Unauthorized",
			"data":    gin.H{},
		})
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  false,
			"message": "Invalid album ID",
			"data":    gin.H{},
		})
		return
	}

	var album data.Album
	if err := h.db.Where("id = ? AND user_id = ?", id, user.ID).First(&album).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"status":  false,
			"message": "Album not found",
			"data":    gin.H{},
		})
		return
	}

	if err := h.db.Delete(&album).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  false,
			"message": "Failed to delete album",
			"data":    gin.H{},
		})
		return
	}

	c.Header("X-RateLimit-Limit", "60")
	c.Header("X-RateLimit-Remaining", "59")

	c.JSON(http.StatusOK, gin.H{
		"status":  true,
		"message": "Album deleted successfully",
		"data":    gin.H{},
	})
}

// 辅助函数
func getBaseURL(c *gin.Context) string {
	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	host := c.Request.Host
	return fmt.Sprintf("%s://%s", scheme, host)
}

func formatHumanDate(t time.Time) string {
	now := time.Now()
	diff := now.Sub(t)

	if diff < time.Minute {
		return "刚刚"
	} else if diff < time.Hour {
		return fmt.Sprintf("%d分钟前", int(diff.Minutes()))
	} else if diff < 24*time.Hour {
		return fmt.Sprintf("%d小时前", int(diff.Hours()))
	} else if diff < 30*24*time.Hour {
		return fmt.Sprintf("%d天前", int(diff.Hours()/24))
	}
	return t.Format("2006-01-02")
}

func (h *LskyV1Handler) resolveAssetPublicURL(c *gin.Context, asset data.FileAsset) string {
	if strings.TrimSpace(asset.PublicURL) != "" {
		return strings.TrimSpace(asset.PublicURL)
	}
	if h.fileService != nil {
		if publicURL, err := h.fileService.PublicURL(c.Request.Context(), asset); err == nil && strings.TrimSpace(publicURL) != "" {
			return strings.TrimSpace(publicURL)
		}
	}
	rel := strings.Trim(strings.TrimSpace(asset.RelativePath), "/")
	if rel != "" {
		return "/" + rel
	}
	return ""
}
