package api

import (
	"context"
	"crypto/tls"
	"encoding/json"
	stdhtml "html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"skyimage/internal/admin"
	"skyimage/internal/config"
	"skyimage/internal/data"
	"skyimage/internal/files"
	"skyimage/internal/installer"
	"skyimage/internal/mail"
	"skyimage/internal/middleware"
	"skyimage/internal/notifications"
	"skyimage/internal/session"
	"skyimage/internal/turnstile"
	"skyimage/internal/users"
	"skyimage/internal/verification"
)

type Server struct {
	engine        *gin.Engine
	mu            sync.RWMutex
	cfg           config.Config
	db            *gorm.DB
	installer     *installer.Service
	admin         *admin.Service
	files         *files.Service
	users         *users.Service
	notifications *notifications.Service
	mail          *mail.Service
	turnstile     *turnstile.Service
	verification  *verification.Service
	session       *session.Manager
	authLimiter   *requestLimiter
	publicPaths   map[string]struct{}
}

func NewServer(cfg config.Config, db *gorm.DB) *Server {
	gin.SetMode(gin.ReleaseMode)
	engine := gin.New()
	trustedProxies := cfg.TrustedProxies
	if len(trustedProxies) == 0 {
		trustedProxies = nil
	}
	if err := engine.SetTrustedProxies(trustedProxies); err != nil {
		log.Printf("set trusted proxies failed: %v", err)
	}

	// 构建 CORS 允许的源列表
	allowedOrigins := []string{cfg.PublicBaseURL}
	if len(cfg.CORSAllowedOrigins) > 0 {
		allowedOrigins = append(allowedOrigins, cfg.CORSAllowedOrigins...)
	}

	engine.Use(
		gin.Logger(),
		gin.Recovery(),
		middleware.CORS(allowedOrigins...),
	)
	engine.RedirectTrailingSlash = false

	s := &Server{
		engine:      engine,
		authLimiter: newRequestLimiter(),
		publicPaths: make(map[string]struct{}),
	}
	s.applyRuntimeConfig(cfg, db)
	s.installer = installer.New(db, cfg, s.applyRuntimeConfig)
	s.registerRoutes()
	return s
}

func (s *Server) applyRuntimeConfig(cfg config.Config, db *gorm.DB) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil && s.db != db {
		if sqlDB, err := s.db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	}
	s.cfg = cfg
	s.db = db
	adminService := admin.New(db)
	s.admin = adminService
	s.files = files.New(db, cfg)
	s.users = users.New(db)
	s.notifications = notifications.New(db)
	s.mail = mail.New(adminService)
	s.turnstile = turnstile.New(adminService)
	s.verification = verification.New()
	if s.session == nil {
		s.session = session.NewManager(db, 24*time.Hour)
	} else {
		s.session.SetDB(db)
	}
	if s.installer != nil {
		s.installer.SetRuntime(db, cfg)
	}
}

func (s *Server) Run(ctx context.Context) error {
	srv := &http.Server{
		Addr:    s.cfg.HTTPAddr,
		Handler: s.engine,
	}
	errCh := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		ctxShutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return srv.Shutdown(ctxShutdown)
	case err := <-errCh:
		return err
	}
}

func (s *Server) healthHandler(c *gin.Context) {
	status, err := s.installer.Status(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"status":    "ok",
			"installer": status,
		},
	})
}

func (s *Server) robotsHandler(c *gin.Context) {
	robotsTxt := `User-agent: *
Allow: /
Disallow: /api/
Disallow: /dashboard/
Disallow: /login
Disallow: /register
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /installer

	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(robotsTxt))
}

func (s *Server) registerRoutes() {
	apiGroup := s.engine.Group("/api")
	apiGroup.GET("/health", s.healthHandler)
	s.registerInstallerRoutes(apiGroup)
	s.registerAuthRoutes(apiGroup)
	s.registerAccountRoutes(apiGroup)
	s.registerAdminRoutes(apiGroup)
	s.registerFileRoutes(apiGroup)
	s.registerSiteRoutes(apiGroup)
	s.registerLskyV1Routes(apiGroup)
	s.registerStaticAssets()
	s.registerFrontend()
	s.engine.GET("/robots.txt", s.robotsHandler)
}

func (s *Server) registerFrontend() {
	distPath := filepath.Clean(s.cfg.FrontendDist)
	assetsPath := filepath.Join(distPath, "assets")
	s.engine.StaticFS("/assets", gin.Dir(assetsPath, false))

	s.engine.Use(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Next()
			return
		}
		if strings.HasPrefix(c.Request.URL.Path, "/assets/") {
			c.Next()
			return
		}
		c.Next()
	})

	s.engine.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api") {
			c.JSON(http.StatusNotFound, gin.H{
				"error":   "api route not found",
				"path":    c.Request.URL.Path,
				"method":  c.Request.Method,
				"message": "check API base path, HTTP method, and trailing slash",
			})
			return
		}
		if s.tryServeLocalFile(c) {
			return
		}
		if s.isKnownFrontendRoute(c.Request.URL.Path) {
			s.serveIndexHTML(c, distPath, http.StatusOK)
			return
		}
		s.serveIndexHTML(c, distPath, http.StatusNotFound)
	})
}

func (s *Server) isKnownFrontendRoute(rawPath string) bool {
	cleanPath := "/" + strings.Trim(strings.TrimSpace(rawPath), "/")
	if cleanPath == "/" {
		return true
	}

	exactRoutes := map[string]struct{}{
		"/installer":       {},
		"/login":           {},
		"/register":        {},
		"/forgot-password": {},
		"/reset-password":  {},
		"/terms":           {},
		"/privacy":         {},
	}
	if _, ok := exactRoutes[cleanPath]; ok {
		return true
	}

	prefixRoutes := []string{
		"/dashboard",
	}
	for _, prefix := range prefixRoutes {
		if cleanPath == prefix || strings.HasPrefix(cleanPath, prefix+"/") {
			return true
		}
	}

	return false
}

func (s *Server) registerStaticAssets() {
	mounted := make(map[string]struct{})
	reserved := reservedPublicPathSegments()
	registerPath := func(prefix string) {
		prefix = strings.Trim(prefix, "/")
		lowerPrefix := strings.ToLower(prefix)
		if prefix == "" {
			return
		}
		if _, banned := reserved[lowerPrefix]; banned {
			return
		}
		path := "/" + prefix
		if _, exists := mounted[path]; exists {
			return
		}
		s.publicPaths[prefix] = struct{}{}
		handler := func(c *gin.Context) {
			rel := strings.TrimPrefix(c.Param("filepath"), "/")
			if rel == "" || !s.serveLocalFileByRelative(c, rel) {
				c.Status(http.StatusNotFound)
				return
			}
		}
		s.engine.GET(path+"/*filepath", handler)
		s.engine.HEAD(path+"/*filepath", handler)
		mounted[path] = struct{}{}
	}

	registerPath(s.defaultLocalPublicSegment())

	strategies, err := s.admin.ListStrategies(context.Background())
	if err != nil {
		log.Printf("load strategies for public paths: %v", err)
		return
	}
	for _, strategy := range strategies {
		var cfg map[string]interface{}
		if len(strategy.Configs) == 0 {
			continue
		}
		if err := json.Unmarshal(strategy.Configs, &cfg); err != nil {
			log.Printf("parse strategy config for static mount: %v", err)
			continue
		}
		driver := strings.ToLower(stringValue(cfg, "driver"))
		if driver == "" {
			driver = "local"
		}
		if driver != "local" {
			continue
		}
		baseURL := pathPrefix(stringValue(cfg, "url"))
		if baseURL == "" {
			baseURL = pathPrefix(stringValue(cfg, "base_url"))
		}
		if baseURL == "" {
			baseURL = pathPrefix(stringValue(cfg, "baseUrl"))
		}
		if baseURL == "" {
			baseURL = s.defaultLocalPublicSegment()
		}
		registerPath(baseURL)
	}
}

func pathPrefix(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "//") {
		raw = "http:" + raw
	}
	if strings.HasPrefix(raw, "/") {
		return strings.Trim(strings.Trim(raw, "/"), "/")
	}
	if strings.Contains(raw, "://") {
		u, err := url.Parse(raw)
		if err == nil {
			return strings.Trim(strings.Trim(u.Path, "/"), "/")
		}
	}
	if looksLikeHost(raw) {
		u, err := url.Parse("http://" + raw)
		if err == nil {
			return strings.Trim(strings.Trim(u.Path, "/"), "/")
		}
	}
	return strings.Trim(strings.Trim(raw, "/"), "/")
}

func looksLikeHost(raw string) bool {
	lower := strings.ToLower(raw)
	return strings.Contains(raw, ".") || strings.Contains(raw, ":") || strings.HasPrefix(lower, "localhost")
}

func stringValue(cfg map[string]interface{}, key string) string {
	if v, ok := cfg[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func (s *Server) defaultLocalPublicSegment() string {
	segment := filepath.Base(s.cfg.StoragePath)
	segment = strings.Trim(segment, "/")
	if segment == "" || segment == "." {
		return "uploads"
	}
	if _, banned := reservedPublicPathSegments()[strings.ToLower(segment)]; banned {
		return "uploads"
	}
	return segment
}

func reservedPublicPathSegments() map[string]struct{} {
	return map[string]struct{}{
		"api":             {},
		"assets":          {},
		"forgot-password": {},
		"reset-password":  {},
	}
}

func (s *Server) tryServeLocalFile(c *gin.Context) bool {
	if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
		return false
	}
	rel := strings.Trim(c.Request.URL.Path, "/")
	if rel == "" {
		return false
	}

	candidates := []string{rel}
	segment, rest := splitFirstSegment(rel)
	if _, ok := s.publicPaths[segment]; ok && rest != "" {
		candidates = append(candidates, rest)
	}

	for _, candidate := range candidates {
		if s.serveLocalFileByRelative(c, candidate) {
			return true
		}
	}
	return false
}

func (s *Server) serveLocalFileByRelative(c *gin.Context, rel string) bool {
	file, err := s.files.FindByRelativePath(c.Request.Context(), rel)
	if err != nil {
		return false
	}
	// 移除 visibility 检查 - 公开和私有图片都可以通过直接链接访问
	// visibility 只影响是否在画廊中显示
	driver := strings.ToLower(strings.TrimSpace(file.StorageProvider))
	if driver == "" {
		driver = "local"
	}
	if driver == "s3" || driver == "minio" {
		proxy, err := s.files.FetchProxyObject(c.Request.Context(), file)
		if err != nil {
			return false
		}
		defer proxy.Body.Close()

		if proxy.CacheControl != "" {
			c.Writer.Header().Set("Cache-Control", proxy.CacheControl)
		}
		if proxy.ETag != "" {
			c.Writer.Header().Set("ETag", proxy.ETag)
		}
		if proxy.ContentLength > 0 {
			c.Writer.Header().Set("Content-Length", strconv.FormatInt(proxy.ContentLength, 10))
		}
		if proxy.LastModified != nil {
			c.Writer.Header().Set("Last-Modified", proxy.LastModified.UTC().Format(http.TimeFormat))
		}

		mimeType := strings.TrimSpace(proxy.ContentType)
		if mimeType == "" || mimeType == "application/octet-stream" {
			if strings.TrimSpace(file.MimeType) != "" && file.MimeType != "application/octet-stream" {
				mimeType = file.MimeType
			} else {
				ext := strings.ToLower(strings.TrimPrefix(file.Extension, "."))
				if ext == "" {
					ext = strings.ToLower(strings.TrimPrefix(filepath.Ext(file.Name), "."))
				}
				mimeType = getMimeTypeByExtension(ext)
				if mimeType == "" {
					mimeType = "application/octet-stream"
				}
			}
		}
		c.Writer.Header().Set("Content-Type", mimeType)
		if strings.HasPrefix(mimeType, "image/") ||
			strings.HasPrefix(mimeType, "video/") ||
			strings.HasPrefix(mimeType, "audio/") ||
			mimeType == "application/pdf" ||
			strings.HasPrefix(mimeType, "text/") {
			c.Writer.Header().Set("Content-Disposition", "inline")
		}

		c.Status(http.StatusOK)
		if c.Request.Method == http.MethodHead {
			return true
		}
		_, _ = io.Copy(c.Writer, proxy.Body)
		return true
	}
	if driver == "webdav" {
		return s.serveWebDAVFile(c, file)
	}
	if strings.TrimSpace(file.Path) == "" {
		return false
	}
	info, err := os.Stat(file.Path)
	if err != nil || info.IsDir() {
		return false
	}

	// 优先使用数据库中存储的 MimeType，但如果是 application/octet-stream 则重新检测
	mimeType := strings.TrimSpace(file.MimeType)
	if mimeType == "" || mimeType == "application/octet-stream" {
		// 根据文件扩展名检测 MIME 类型
		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(file.Path), "."))
		mimeType = getMimeTypeByExtension(ext)
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
	}

	// 设置 Content-Type
	c.Writer.Header().Set("Content-Type", mimeType)

	// 对于图片、视频、音频、PDF 等可预览的文件，设置为 inline
	if strings.HasPrefix(mimeType, "image/") ||
		strings.HasPrefix(mimeType, "video/") ||
		strings.HasPrefix(mimeType, "audio/") ||
		mimeType == "application/pdf" ||
		strings.HasPrefix(mimeType, "text/") {
		c.Writer.Header().Set("Content-Disposition", "inline")
	}

	c.File(file.Path)
	return true
}

func (s *Server) serveWebDAVFile(c *gin.Context, file data.FileAsset) bool {
	strategy, err := s.admin.FindStrategyByID(c.Request.Context(), file.StrategyID)
	if err != nil {
		return false
	}
	var cfg map[string]interface{}
	if len(strategy.Configs) > 0 {
		if err := json.Unmarshal(strategy.Configs, &cfg); err != nil {
			return false
		}
	}

	endpoint := strings.TrimSpace(stringValue(cfg, "webdav_endpoint"))
	if endpoint == "" {
		endpoint = strings.TrimSpace(stringValue(cfg, "webdav_url"))
	}
	if endpoint == "" {
		endpoint = strings.TrimSpace(stringValue(cfg, "webdavUrl"))
	}
	username := strings.TrimSpace(stringValue(cfg, "webdav_username"))
	if username == "" {
		username = strings.TrimSpace(stringValue(cfg, "webdav_user"))
	}
	if username == "" {
		username = strings.TrimSpace(stringValue(cfg, "webdavUsername"))
	}
	password := strings.TrimSpace(stringValue(cfg, "webdav_password"))
	if password == "" {
		password = strings.TrimSpace(stringValue(cfg, "webdav_pass"))
	}
	if password == "" {
		password = strings.TrimSpace(stringValue(cfg, "webdavPassword"))
	}
	basePath := strings.TrimSpace(stringValue(cfg, "webdav_base_path"))
	if basePath == "" {
		basePath = strings.TrimSpace(stringValue(cfg, "webdav_path"))
	}
	if basePath == "" {
		basePath = strings.TrimSpace(stringValue(cfg, "webdavBasePath"))
	}
	skipTLSVerify := boolValue(cfg["webdav_skip_tls_verify"]) || boolValue(cfg["webdavSkipTLSVerify"])

	objectURL := strings.TrimSpace(file.Path)
	if !strings.HasPrefix(strings.ToLower(objectURL), "http://") && !strings.HasPrefix(strings.ToLower(objectURL), "https://") {
		remoteURL, err := buildWebDAVObjectURL(endpoint, basePath, file.RelativePath)
		if err != nil {
			return false
		}
		objectURL = remoteURL
	}

	client := &http.Client{}
	if skipTLSVerify {
		tr := http.DefaultTransport.(*http.Transport).Clone()
		if tr.TLSClientConfig == nil {
			tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
		} else {
			tr.TLSClientConfig = tr.TLSClientConfig.Clone()
			tr.TLSClientConfig.InsecureSkipVerify = true
		}
		client = &http.Client{Transport: tr}
	}

	req, err := http.NewRequestWithContext(c.Request.Context(), c.Request.Method, objectURL, nil)
	if err != nil {
		return false
	}
	if username != "" {
		req.SetBasicAuth(username, password)
	}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}

	copyHeaderIfPresent(c.Writer.Header(), resp.Header, "Content-Type")
	copyHeaderIfPresent(c.Writer.Header(), resp.Header, "Content-Length")
	copyHeaderIfPresent(c.Writer.Header(), resp.Header, "Cache-Control")
	copyHeaderIfPresent(c.Writer.Header(), resp.Header, "ETag")
	copyHeaderIfPresent(c.Writer.Header(), resp.Header, "Last-Modified")
	// 不复制 Content-Disposition 头，让浏览器根据 Content-Type 决定是预览还是下载
	// 对于图片等媒体文件，浏览器会自动预览而不是下载

	// 获取或检测正确的 MIME 类型
	mimeType := c.Writer.Header().Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		// 优先使用数据库中的 MimeType
		if strings.TrimSpace(file.MimeType) != "" && file.MimeType != "application/octet-stream" {
			mimeType = file.MimeType
		} else {
			// 根据文件扩展名检测
			ext := strings.ToLower(strings.TrimPrefix(file.Extension, "."))
			if ext == "" {
				ext = strings.ToLower(strings.TrimPrefix(filepath.Ext(file.Name), "."))
			}
			detected := getMimeTypeByExtension(ext)
			if detected != "" {
				mimeType = detected
			} else {
				mimeType = "application/octet-stream"
			}
		}
		c.Writer.Header().Set("Content-Type", mimeType)
	}

	// 确保图片、视频、音频、PDF 等可预览的文件设置为 inline 显示
	if strings.HasPrefix(mimeType, "image/") ||
		strings.HasPrefix(mimeType, "video/") ||
		strings.HasPrefix(mimeType, "audio/") ||
		mimeType == "application/pdf" ||
		strings.HasPrefix(mimeType, "text/") {
		c.Writer.Header().Set("Content-Disposition", "inline")
	}

	c.Status(http.StatusOK)
	if c.Request.Method == http.MethodHead {
		return true
	}
	_, _ = io.Copy(c.Writer, resp.Body)
	return true
}

func buildWebDAVObjectURL(endpoint string, basePath string, relativePath string) (string, error) {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return "", http.ErrMissingFile
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", http.ErrMissingFile
	}
	rel := strings.Trim(strings.ReplaceAll(strings.TrimSpace(relativePath), "\\", "/"), "/")
	parsed.Path = urlPathJoin(parsed.Path, basePath, rel)
	return parsed.String(), nil
}

func urlPathJoin(parts ...string) string {
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		clean := strings.Trim(strings.TrimSpace(part), "/")
		if clean == "" {
			continue
		}
		items = append(items, clean)
	}
	if len(items) == 0 {
		return "/"
	}
	return "/" + strings.Join(items, "/")
}

func boolValue(value interface{}) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		normalized := strings.ToLower(strings.TrimSpace(v))
		return normalized == "1" || normalized == "true" || normalized == "yes" || normalized == "on"
	default:
		return false
	}
}

func copyHeaderIfPresent(dst http.Header, src http.Header, key string) {
	value := strings.TrimSpace(src.Get(key))
	if value == "" {
		return
	}
	dst.Set(key, value)
}

func getMimeTypeByExtension(ext string) string {
	// 常见图片格式
	imageTypes := map[string]string{
		"jpg":  "image/jpeg",
		"jpeg": "image/jpeg",
		"png":  "image/png",
		"gif":  "image/gif",
		"webp": "image/webp",
		"bmp":  "image/bmp",
		"svg":  "image/svg+xml",
		"ico":  "image/x-icon",
		"tiff": "image/tiff",
		"tif":  "image/tiff",
		"heic": "image/heic",
		"heif": "image/heif",
	}

	// 常见视频格式
	videoTypes := map[string]string{
		"mp4":  "video/mp4",
		"webm": "video/webm",
		"ogg":  "video/ogg",
		"avi":  "video/x-msvideo",
		"mov":  "video/quicktime",
		"wmv":  "video/x-ms-wmv",
		"flv":  "video/x-flv",
		"mkv":  "video/x-matroska",
	}

	// 常见音频格式
	audioTypes := map[string]string{
		"mp3":  "audio/mpeg",
		"wav":  "audio/wav",
		"ogg":  "audio/ogg",
		"m4a":  "audio/mp4",
		"flac": "audio/flac",
		"aac":  "audio/aac",
	}

	// 其他常见格式
	otherTypes := map[string]string{
		"pdf":  "application/pdf",
		"txt":  "text/plain",
		"html": "text/html",
		"htm":  "text/html",
		"css":  "text/css",
		"js":   "application/javascript",
		"json": "application/json",
		"xml":  "application/xml",
		"zip":  "application/zip",
		"rar":  "application/x-rar-compressed",
		"7z":   "application/x-7z-compressed",
	}

	ext = strings.ToLower(strings.TrimSpace(ext))

	if mime, ok := imageTypes[ext]; ok {
		return mime
	}
	if mime, ok := videoTypes[ext]; ok {
		return mime
	}
	if mime, ok := audioTypes[ext]; ok {
		return mime
	}
	if mime, ok := otherTypes[ext]; ok {
		return mime
	}

	return ""
}

func splitFirstSegment(path string) (string, string) {
	path = strings.Trim(path, "/")
	if path == "" {
		return "", ""
	}
	idx := strings.Index(path, "/")
	if idx < 0 {
		return path, ""
	}
	return path[:idx], path[idx+1:]
}

func (s *Server) serveIndexHTML(c *gin.Context, distPath string, statusCode int) {
	indexPath := filepath.Join(distPath, "index.html")

	// 读取 index.html 内容
	content, err := os.ReadFile(indexPath)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	// 获取站点配置
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		// 如果获取配置失败，直接返回原始 HTML
		c.Data(statusCode, "text/html; charset=utf-8", content)
		return
	}

	title := strings.TrimSpace(settings["site.title"])
	logo := strings.TrimSpace(settings["site.logo"])

	// 替换 HTML 中的标题
	html := string(content)
	if title != "" {
		safeTitle := stdhtml.EscapeString(title)
		html = strings.Replace(html, "<title>skyImage</title>", "<title>"+safeTitle+"</title>", 1)
	}

	// 替换 favicon
	if logo != "" {
		logoURL := sanitizeFaviconURL(logo)
		if logoURL != "" {
			oldFavicon := `<link rel="icon" type="image/x-icon" href="/favicon.ico" />`
			newFavicon := `<link rel="icon" type="image/x-icon" href="` + stdhtml.EscapeString(logoURL) + `" />`
			html = strings.Replace(html, oldFavicon, newFavicon, 1)
		}
	}

	c.Data(statusCode, "text/html; charset=utf-8", []byte(html))
}

func sanitizeFaviconURL(raw string) string {
	logo := strings.TrimSpace(raw)
	if logo == "" || strings.ContainsAny(logo, "\r\n") {
		return ""
	}
	lower := strings.ToLower(logo)
	if strings.HasPrefix(lower, "data:") {
		if strings.HasPrefix(lower, "data:image/") {
			return logo
		}
		return ""
	}
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		parsed, err := url.Parse(logo)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			return ""
		}
		return parsed.String()
	}
	if strings.HasPrefix(logo, "/") {
		return logo
	}
	return "/" + strings.TrimLeft(logo, "/")
}

func (s *Server) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		s.mu.RLock()
		userService := s.users
		sessionManager := s.session
		s.mu.RUnlock()
		middleware.Auth(userService, sessionManager)(c)
	}
}
