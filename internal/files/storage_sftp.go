package files

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/sha1"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"

	"skyimage/internal/data"
)

type sftpConnConfig struct {
	address        string
	username       string
	password       string
	privateKey     string
	privateKeyPath string
	basePath       string
	timeout        time.Duration
	knownHosts     string
}

func (s *Service) storeSFTPObject(ctx context.Context, cfg strategyConfig, relativePath string, head []byte, remain io.Reader) (storeObjectResult, error) {
	sftpCfg, err := normalizeSFTPConfig(cfg)
	if err != nil {
		return storeObjectResult{}, err
	}
	client, err := newSFTPClient(ctx, sftpCfg)
	if err != nil {
		return storeObjectResult{}, err
	}
	defer func() {
		_ = client.Close()
	}()

	remotePath, err := buildSFTPObjectPath(sftpCfg.basePath, relativePath)
	if err != nil {
		return storeObjectResult{}, err
	}
	if err := ensureSFTPParentDirs(client, remotePath); err != nil {
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

	dst, err := client.Create(remotePath)
	if err != nil {
		return storeObjectResult{}, fmt.Errorf("sftp create file: %w", err)
	}
	defer func() {
		_ = dst.Close()
	}()

	if _, err := io.Copy(dst, counter); err != nil {
		return storeObjectResult{}, fmt.Errorf("sftp write file: %w", err)
	}

	return storeObjectResult{
		Path: remotePath,
		Size: counter.n,
		MD5:  md5Hasher.Sum(nil),
		SHA1: sha1Hasher.Sum(nil),
	}, nil
}

func (s *Service) deleteSFTPObject(ctx context.Context, cfg strategyConfig, file data.FileAsset) error {
	sftpCfg, err := normalizeSFTPConfig(cfg)
	if err != nil {
		return err
	}
	client, err := newSFTPClient(ctx, sftpCfg)
	if err != nil {
		return err
	}
	defer func() {
		_ = client.Close()
	}()

	remotePath := strings.TrimSpace(file.Path)
	if remotePath == "" {
		remotePath, err = buildSFTPObjectPath(sftpCfg.basePath, file.RelativePath)
		if err != nil {
			return err
		}
	}

	if err := client.Remove(remotePath); err != nil {
		if isSFTPNotFoundErr(err) {
			return nil
		}
		return err
	}
	return nil
}

func normalizeSFTPConfig(cfg strategyConfig) (sftpConnConfig, error) {
	rawHost := strings.TrimSpace(cfg.SFTPHost)
	if rawHost == "" {
		return sftpConnConfig{}, fmt.Errorf("sftp host is required")
	}
	parsed, err := parseSFTPAddress(rawHost)
	if err != nil {
		return sftpConnConfig{}, err
	}

	basePath := sanitizeRelativePath(cfg.SFTPBasePath)
	if basePath == "" {
		basePath = parsed.basePath
	}
	username := strings.TrimSpace(cfg.SFTPUsername)
	password := cfg.SFTPPassword
	if username == "" {
		username = parsed.username
	}
	if password == "" {
		password = parsed.password
	}
	if username == "" {
		username = "root"
	}

	port := cfg.SFTPPort
	if port <= 0 {
		port = parsed.port
	}
	if port <= 0 {
		port = 22
	}

	timeout := time.Duration(cfg.SFTPTimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	addr := net.JoinHostPort(parsed.host, strconv.Itoa(port))
	return sftpConnConfig{
		address:        addr,
		username:       username,
		password:       password,
		privateKey:     strings.TrimSpace(cfg.SFTPPrivateKey),
		privateKeyPath: strings.TrimSpace(cfg.SFTPPrivateKeyPath),
		basePath:       basePath,
		timeout:        timeout,
		knownHosts:     strings.TrimSpace(cfg.SFTPKnownHosts),
	}, nil
}

type parsedSFTPAddress struct {
	host     string
	port     int
	basePath string
	username string
	password string
}

func parseSFTPAddress(raw string) (parsedSFTPAddress, error) {
	if raw == "" {
		return parsedSFTPAddress{}, fmt.Errorf("sftp host is required")
	}
	normalized := strings.TrimSpace(raw)
	if !strings.Contains(normalized, "://") {
		normalized = "ssh://" + normalized
	}
	u, err := url.Parse(normalized)
	if err != nil || u.Host == "" {
		return parsedSFTPAddress{}, fmt.Errorf("invalid sftp host")
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
	basePath := sanitizeRelativePath(u.Path)
	return parsedSFTPAddress{
		host:     host,
		port:     port,
		basePath: basePath,
		username: username,
		password: password,
	}, nil
}

func newSFTPClient(ctx context.Context, cfg sftpConnConfig) (*sftp.Client, error) {
	var authMethods []ssh.AuthMethod

	// 优先使用私钥认证
	if cfg.privateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(cfg.privateKey))
		if err != nil {
			return nil, fmt.Errorf("sftp parse private key: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	} else if cfg.privateKeyPath != "" {
		// 私钥文件路径在服务端读取
		return nil, fmt.Errorf("sftp private key path is not supported in this version, please paste the key content directly")
	}

	// 如果有密码，添加密码认证
	if cfg.password != "" {
		authMethods = append(authMethods, ssh.Password(cfg.password))
	}

	if len(authMethods) == 0 {
		return nil, fmt.Errorf("sftp requires at least a password or private key for authentication")
	}

	var hostKeyCallback ssh.HostKeyCallback
	if cfg.knownHosts != "" {
		tmpFile, err := os.CreateTemp("", "skyimage-knownhosts-*")
		if err != nil {
			return nil, fmt.Errorf("sftp create temp known_hosts: %w", err)
		}
		tmpPath := tmpFile.Name()
		if _, err := tmpFile.WriteString(cfg.knownHosts); err != nil {
			_ = tmpFile.Close()
			_ = os.Remove(tmpPath)
			return nil, fmt.Errorf("sftp write temp known_hosts: %w", err)
		}
		_ = tmpFile.Close()
		defer func() { _ = os.Remove(tmpPath) }()

		cb, err := knownhosts.New(tmpPath)
		if err != nil {
			return nil, fmt.Errorf("sftp parse known_hosts: %w", err)
		}
		hostKeyCallback = cb
	} else {
		hostKeyCallback = ssh.InsecureIgnoreHostKey()
	}

	sshConfig := &ssh.ClientConfig{
		User:            cfg.username,
		Auth:            authMethods,
		HostKeyCallback: hostKeyCallback,
		Timeout:         cfg.timeout,
	}

	var sshClient *ssh.Client
	var err error
	if ctx != nil && ctx.Done() != nil {
		dialer := net.Dialer{Timeout: cfg.timeout}
		conn, dialErr := dialer.DialContext(ctx, "tcp", cfg.address)
		if dialErr != nil {
			return nil, fmt.Errorf("sftp dial: %w", dialErr)
		}
		sshConn, chans, reqs, handErr := ssh.NewClientConn(conn, cfg.address, sshConfig)
		if handErr != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("sftp handshake: %w", handErr)
		}
		sshClient = ssh.NewClient(sshConn, chans, reqs)
	} else {
		sshClient, err = ssh.Dial("tcp", cfg.address, sshConfig)
		if err != nil {
			return nil, fmt.Errorf("sftp dial: %w", err)
		}
	}

	sftpClient, err := sftp.NewClient(sshClient)
	if err != nil {
		_ = sshClient.Close()
		return nil, fmt.Errorf("sftp new client: %w", err)
	}

	return sftpClient, nil
}

func buildSFTPObjectPath(basePath string, relativePath string) (string, error) {
	rel := sanitizeRelativePath(relativePath)
	if rel == "" {
		return "", fmt.Errorf("sftp relative path is empty")
	}
	base := sanitizeRelativePath(basePath)
	if base == "" {
		return "/" + rel, nil
	}
	return "/" + path.Join(base, rel), nil
}

func ensureSFTPParentDirs(client *sftp.Client, remotePath string) error {
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
		if err := client.Mkdir(target); err != nil && !isSFTPDirExistsErr(err) {
			return err
		}
	}
	return nil
}

func isSFTPDirExistsErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "exists") || strings.Contains(msg, "file exists") || strings.Contains(msg, "already exists")
}

func isSFTPNotFoundErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "not found") || strings.Contains(msg, "no such file") || strings.Contains(msg, "does not exist")
}
