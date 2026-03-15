package files

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/sha1"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/jlaffaye/ftp"

	"skyimage/internal/data"
)

type ftpConnConfig struct {
	address     string
	username    string
	password    string
	basePath    string
	useTLS      bool
	implicitTLS bool
	skipVerify  bool
	timeout     time.Duration
}

type countingReader struct {
	r io.Reader
	n int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	return n, err
}

func (s *Service) storeFTPObject(ctx context.Context, cfg strategyConfig, relativePath string, head []byte, remain io.Reader) (storeObjectResult, error) {
	ftpCfg, err := normalizeFTPConfig(cfg)
	if err != nil {
		return storeObjectResult{}, err
	}
	conn, err := newFTPClient(ctx, ftpCfg)
	if err != nil {
		return storeObjectResult{}, err
	}
	defer func() {
		_ = conn.Quit()
	}()

	remotePath, err := buildFTPObjectPath(ftpCfg.basePath, relativePath)
	if err != nil {
		return storeObjectResult{}, err
	}
	if err := ensureFTPParentDirs(conn, remotePath); err != nil {
		return storeObjectResult{}, err
	}

	md5Hasher := md5.New()
	sha1Hasher := sha1.New()

	var reader io.Reader
	if remain != nil {
		reader = io.MultiReader(bytes.NewReader(head), remain)
	} else {
		reader = bytes.NewReader(head)
	}

	tee := io.TeeReader(reader, io.MultiWriter(md5Hasher, sha1Hasher))
	counter := &countingReader{r: tee}
	if err := conn.Stor(remotePath, counter); err != nil {
		return storeObjectResult{}, err
	}

	return storeObjectResult{
		Path: remotePath,
		Size: counter.n,
		MD5:  md5Hasher.Sum(nil),
		SHA1: sha1Hasher.Sum(nil),
	}, nil
}

func (s *Service) deleteFTPObject(ctx context.Context, cfg strategyConfig, file data.FileAsset) error {
	ftpCfg, err := normalizeFTPConfig(cfg)
	if err != nil {
		return err
	}
	conn, err := newFTPClient(ctx, ftpCfg)
	if err != nil {
		return err
	}
	defer func() {
		_ = conn.Quit()
	}()

	remotePath := strings.TrimSpace(file.Path)
	if remotePath == "" {
		remotePath, err = buildFTPObjectPath(ftpCfg.basePath, file.RelativePath)
		if err != nil {
			return err
		}
	}

	if err := conn.Delete(remotePath); err != nil {
		if isFTPNotFoundErr(err) {
			return nil
		}
		return err
	}
	return nil
}

func normalizeFTPConfig(cfg strategyConfig) (ftpConnConfig, error) {
	rawHost := strings.TrimSpace(cfg.FTPHost)
	if rawHost == "" {
		return ftpConnConfig{}, fmt.Errorf("ftp host is required")
	}
	parsed, err := parseFTPAddress(rawHost)
	if err != nil {
		return ftpConnConfig{}, err
	}

	basePath := sanitizeRelativePath(cfg.FTPBasePath)
	if basePath == "" {
		basePath = parsed.basePath
	}
	username := strings.TrimSpace(cfg.FTPUsername)
	password := cfg.FTPPassword
	if username == "" {
		username = parsed.username
	}
	if password == "" {
		password = parsed.password
	}
	if username == "" {
		username = "anonymous"
	}

	useTLS := cfg.FTPTLS || parsed.useTLS
	implicitTLS := parsed.implicitTLS

	port := cfg.FTPPort
	if port <= 0 {
		port = parsed.port
	}
	if port <= 0 {
		port = 21
	}

	timeout := time.Duration(cfg.FTPTimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	addr := net.JoinHostPort(parsed.host, strconv.Itoa(port))
	return ftpConnConfig{
		address:     addr,
		username:    username,
		password:    password,
		basePath:    basePath,
		useTLS:      useTLS,
		implicitTLS: implicitTLS,
		skipVerify:  cfg.FTPSkipTLSVerify,
		timeout:     timeout,
	}, nil
}

type parsedFTPAddress struct {
	host        string
	port        int
	basePath    string
	username    string
	password    string
	useTLS      bool
	implicitTLS bool
}

func parseFTPAddress(raw string) (parsedFTPAddress, error) {
	if raw == "" {
		return parsedFTPAddress{}, fmt.Errorf("ftp host is required")
	}
	normalized := strings.TrimSpace(raw)
	if !strings.Contains(normalized, "://") {
		normalized = "ftp://" + normalized
	}
	u, err := url.Parse(normalized)
	if err != nil || u.Host == "" {
		return parsedFTPAddress{}, fmt.Errorf("invalid ftp host")
	}
	host := u.Hostname()
	port := 0
	if u.Port() != "" {
		if p, err := strconv.Atoi(u.Port()); err == nil {
			port = p
		}
	}
	username := ""
	password := ""
	if u.User != nil {
		username = u.User.Username()
		if pass, ok := u.User.Password(); ok {
			password = pass
		}
	}
	scheme := strings.ToLower(u.Scheme)
	useTLS := scheme == "ftps"
	implicitTLS := scheme == "ftps"
	basePath := sanitizeRelativePath(u.Path)
	return parsedFTPAddress{
		host:        host,
		port:        port,
		basePath:    basePath,
		username:    username,
		password:    password,
		useTLS:      useTLS,
		implicitTLS: implicitTLS,
	}, nil
}

func newFTPClient(ctx context.Context, cfg ftpConnConfig) (*ftp.ServerConn, error) {
	options := []ftp.DialOption{
		ftp.DialWithTimeout(cfg.timeout),
	}
	if cfg.useTLS {
		tlsCfg := &tls.Config{InsecureSkipVerify: cfg.skipVerify}
		if cfg.implicitTLS {
			options = append(options, ftp.DialWithTLS(tlsCfg))
		} else {
			options = append(options, ftp.DialWithExplicitTLS(tlsCfg))
		}
	}
	if ctx != nil {
		options = append(options, ftp.DialWithContext(ctx))
	}
	conn, err := ftp.Dial(cfg.address, options...)
	if err != nil {
		return nil, err
	}
	if err := conn.Login(cfg.username, cfg.password); err != nil {
		_ = conn.Quit()
		return nil, err
	}
	return conn, nil
}

func buildFTPObjectPath(basePath string, relativePath string) (string, error) {
	rel := sanitizeRelativePath(relativePath)
	if rel == "" {
		return "", fmt.Errorf("ftp relative path is empty")
	}
	base := sanitizeRelativePath(basePath)
	if base == "" {
		return "/" + rel, nil
	}
	return "/" + path.Join(base, rel), nil
}

func ensureFTPParentDirs(conn *ftp.ServerConn, remotePath string) error {
	dir := path.Dir(remotePath)
	dir = strings.TrimSpace(dir)
	if dir == "" || dir == "." || dir == "/" {
		return nil
	}
	segments := strings.Split(strings.Trim(dir, "/"), "/")
	current := ""
	for _, segment := range segments {
		if segment == "" {
			continue
		}
		current = path.Join(current, segment)
		target := "/" + current
		if err := conn.MakeDir(target); err != nil && !isFTPDirExistsErr(err) {
			return err
		}
	}
	return nil
}

func isFTPDirExistsErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "exists") || strings.Contains(msg, "file exists") || strings.Contains(msg, "550")
}

func isFTPNotFoundErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "not found") || strings.Contains(msg, "no such file") || strings.Contains(msg, "550")
}
