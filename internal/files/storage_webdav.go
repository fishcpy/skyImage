package files

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/sha1"
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"

	"gorm.io/gorm"

	"skyimage/internal/data"
)

type storeObjectResult struct {
	Path string
	Size int64
	MD5  []byte
	SHA1 []byte
}

func (s *Service) storeObject(ctx context.Context, cfg strategyConfig, relativePath string, head []byte, remain io.Reader) (storeObjectResult, error) {
	driver := strings.ToLower(strings.TrimSpace(cfg.Driver))
	if driver == "" {
		driver = "local"
	}

	switch driver {
	case "webdav":
		return s.storeWebDAVObject(ctx, cfg, relativePath, head, remain)
	default:
		return s.storeLocalObject(cfg, relativePath, head, remain)
	}
}

func (s *Service) storeLocalObject(cfg strategyConfig, relativePath string, head []byte, remain io.Reader) (storeObjectResult, error) {
	destPath := filepath.Join(cfg.Root, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return storeObjectResult{}, err
	}
	dest, err := os.Create(destPath)
	if err != nil {
		return storeObjectResult{}, err
	}
	defer dest.Close()

	md5Hasher := md5.New()
	sha1Hasher := sha1.New()
	reader := io.MultiReader(bytes.NewReader(head), remain)
	size, err := io.Copy(dest, io.TeeReader(reader, io.MultiWriter(md5Hasher, sha1Hasher)))
	if err != nil {
		return storeObjectResult{}, err
	}

	return storeObjectResult{
		Path: destPath,
		Size: size,
		MD5:  md5Hasher.Sum(nil),
		SHA1: sha1Hasher.Sum(nil),
	}, nil
}

func (s *Service) storeWebDAVObject(ctx context.Context, cfg strategyConfig, relativePath string, head []byte, remain io.Reader) (storeObjectResult, error) {
	if cfg.WebDAVEndpoint == "" {
		return storeObjectResult{}, fmt.Errorf("webdav endpoint is required")
	}

	tmp, err := os.CreateTemp("", "skyimage-webdav-*")
	if err != nil {
		return storeObjectResult{}, err
	}
	tmpPath := tmp.Name()
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
	}()

	md5Hasher := md5.New()
	sha1Hasher := sha1.New()
	reader := io.MultiReader(bytes.NewReader(head), remain)
	size, err := io.Copy(tmp, io.TeeReader(reader, io.MultiWriter(md5Hasher, sha1Hasher)))
	if err != nil {
		return storeObjectResult{}, err
	}
	if _, err := tmp.Seek(0, io.SeekStart); err != nil {
		return storeObjectResult{}, err
	}

	client := newWebDAVHTTPClient(cfg)
	remoteURL, err := buildWebDAVObjectURL(cfg, relativePath)
	if err != nil {
		return storeObjectResult{}, err
	}
	if err := ensureWebDAVParentDirs(ctx, client, cfg, remoteURL); err != nil {
		return storeObjectResult{}, err
	}
	if err := webDAVPut(ctx, client, cfg, remoteURL, tmp, size); err != nil {
		return storeObjectResult{}, err
	}

	return storeObjectResult{
		Path: remoteURL,
		Size: size,
		MD5:  md5Hasher.Sum(nil),
		SHA1: sha1Hasher.Sum(nil),
	}, nil
}

func (s *Service) deleteStoredObject(ctx context.Context, db *gorm.DB, file data.FileAsset) error {
	driver := strings.ToLower(strings.TrimSpace(file.StorageProvider))
	if driver == "" {
		driver = "local"
	}
	if driver != "webdav" {
		return removeFile(file.Path)
	}

	var strategy data.Strategy
	if err := db.WithContext(ctx).First(&strategy, file.StrategyID).Error; err != nil {
		return err
	}
	cfg := s.parseStrategyConfig(strategy)
	client := newWebDAVHTTPClient(cfg)
	objectURL := strings.TrimSpace(file.Path)
	if objectURL == "" {
		var err error
		objectURL, err = buildWebDAVObjectURL(cfg, file.RelativePath)
		if err != nil {
			return err
		}
	}
	return webDAVDelete(ctx, client, cfg, objectURL)
}

func newWebDAVHTTPClient(cfg strategyConfig) *http.Client {
	if !cfg.WebDAVSkipTLSCert {
		return &http.Client{}
	}
	tr := http.DefaultTransport.(*http.Transport).Clone()
	if tr.TLSClientConfig == nil {
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	} else {
		tr.TLSClientConfig = tr.TLSClientConfig.Clone()
		tr.TLSClientConfig.InsecureSkipVerify = true
	}
	return &http.Client{Transport: tr}
}

func buildWebDAVObjectURL(cfg strategyConfig, relativePath string) (string, error) {
	endpoint := strings.TrimSpace(cfg.WebDAVEndpoint)
	if endpoint == "" {
		return "", fmt.Errorf("webdav endpoint is required")
	}
	rel := sanitizeRelativePath(relativePath)
	if rel == "" {
		return "", fmt.Errorf("webdav relative path is empty")
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("invalid webdav endpoint")
	}
	parsed.Path = joinURLPath(parsed.Path, cfg.WebDAVBasePath, rel)
	return parsed.String(), nil
}

func ensureWebDAVParentDirs(ctx context.Context, client *http.Client, cfg strategyConfig, objectURL string) error {
	u, err := url.Parse(objectURL)
	if err != nil {
		return err
	}
	fullPath := strings.Trim(strings.TrimSpace(u.Path), "/")
	if fullPath == "" {
		return nil
	}
	parts := strings.Split(fullPath, "/")
	if len(parts) <= 1 {
		return nil
	}
	current := ""
	for i := 0; i < len(parts)-1; i++ {
		current = path.Join(current, parts[i])
		dirURL := *u
		dirURL.Path = "/" + current
		if err := webDAVMkcol(ctx, client, cfg, dirURL.String()); err != nil {
			return err
		}
	}
	return nil
}

func webDAVMkcol(ctx context.Context, client *http.Client, cfg strategyConfig, target string) error {
	req, err := http.NewRequestWithContext(ctx, "MKCOL", target, nil)
	if err != nil {
		return err
	}
	applyWebDAVAuth(req, cfg)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusCreated, http.StatusMethodNotAllowed, http.StatusOK, http.StatusNoContent:
		return nil
	case http.StatusForbidden:
		exists, checkErr := webDAVPathExists(ctx, client, cfg, target)
		if checkErr == nil && exists {
			return nil
		}
		return fmt.Errorf("webdav MKCOL forbidden: %s", resp.Status)
	default:
		return fmt.Errorf("webdav MKCOL failed: %s", resp.Status)
	}
}

func webDAVPut(ctx context.Context, client *http.Client, cfg strategyConfig, target string, body io.Reader, size int64) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, target, body)
	if err != nil {
		return err
	}
	req.ContentLength = size
	req.Header.Set("Content-Type", "application/octet-stream")
	applyWebDAVAuth(req, cfg)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusCreated, http.StatusNoContent, http.StatusOK:
		return nil
	default:
		return fmt.Errorf("webdav PUT failed: %s", resp.Status)
	}
}

func webDAVDelete(ctx context.Context, client *http.Client, cfg strategyConfig, target string) error {
	if strings.TrimSpace(target) == "" {
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, target, nil)
	if err != nil {
		return err
	}
	applyWebDAVAuth(req, cfg)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK, http.StatusAccepted, http.StatusNoContent, http.StatusNotFound:
		return nil
	default:
		return fmt.Errorf("webdav DELETE failed: %s", resp.Status)
	}
}

func applyWebDAVAuth(req *http.Request, cfg strategyConfig) {
	if cfg.WebDAVUsername != "" {
		req.SetBasicAuth(cfg.WebDAVUsername, cfg.WebDAVPassword)
	}
}

func webDAVPathExists(ctx context.Context, client *http.Client, cfg strategyConfig, target string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, "PROPFIND", target, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Depth", "0")
	applyWebDAVAuth(req, cfg)
	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusMultiStatus, http.StatusOK, http.StatusNoContent:
		return true, nil
	case http.StatusNotFound:
		return false, nil
	case http.StatusForbidden:
		// 无目录查询权限时，退化到 HEAD 试探
		headReq, headErr := http.NewRequestWithContext(ctx, http.MethodHead, target, nil)
		if headErr != nil {
			return false, headErr
		}
		applyWebDAVAuth(headReq, cfg)
		headResp, headDoErr := client.Do(headReq)
		if headDoErr != nil {
			return false, headDoErr
		}
		defer headResp.Body.Close()
		if headResp.StatusCode >= 200 && headResp.StatusCode < 300 {
			return true, nil
		}
		if headResp.StatusCode == http.StatusNotFound {
			return false, nil
		}
		return false, nil
	default:
		return false, nil
	}
}

func joinURLPath(parts ...string) string {
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
	return "/" + path.Join(items...)
}
