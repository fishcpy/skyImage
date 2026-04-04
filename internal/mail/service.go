package mail

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/smtp"
	"strings"

	"skyimage/internal/admin"
)

type Service struct {
	admin *admin.Service
}

func New(adminService *admin.Service) *Service {
	return &Service{
		admin: adminService,
	}
}

type SMTPConfig struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
	Secure   bool
}

func (s *Service) getConfig(ctx context.Context) (*SMTPConfig, error) {
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return nil, err
	}

	host := settings["mail.smtp.host"]
	port := settings["mail.smtp.port"]
	username := settings["mail.smtp.username"]
	password := settings["mail.smtp.password"]
	from := settings["mail.smtp.from"]
	secure := settings["mail.smtp.secure"] == "true"

	if host == "" || port == "" || username == "" {
		return nil, fmt.Errorf("SMTP 配置不完整")
	}

	// 如果没有配置发信邮箱，使用用户名作为发信邮箱（向后兼容）
	if from == "" {
		from = username
	}

	return &SMTPConfig{
		Host:     host,
		Port:     port,
		Username: username,
		Password: password,
		From:     from,
		Secure:   secure,
	}, nil
}

func (s *Service) SendMail(ctx context.Context, to, subject, body string) error {
	config, err := s.getConfig(ctx)
	if err != nil {
		return err
	}

	return s.SendMailWithConfig(config, to, subject, body)
}

func (s *Service) SendMailWithConfig(config *SMTPConfig, to, subject, body string) error {
	from := config.From
	toList := []string{to}

	// 构建邮件消息（符合 RFC 5322 标准）
	message := []byte("From: " + from + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"\r\n" +
		body + "\r\n")

	// 构建认证
	auth := smtp.PlainAuth("", config.Username, config.Password, config.Host)

	// 发送邮件
	addr := config.Host + ":" + config.Port

	// 记录邮件发送详情
	fmt.Printf("[邮件详情] 发件人: %s, 收件人: %s, 主题: %s, 服务器: %s, TLS: %v\n",
		from, to, subject, addr, config.Secure)

	if config.Secure {
		// 使用 TLS
		return s.sendWithTLS(addr, config.Host, auth, from, toList, message)
	}

	// 不使用 TLS
	return smtp.SendMail(addr, auth, from, toList, message)
}

func (s *Service) sendWithTLS(addr, host string, auth smtp.Auth, from string, to []string, message []byte) error {
	tlsConfig := &tls.Config{
		ServerName: host,
	}

	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("连接 SMTP 服务器失败: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("创建 SMTP 客户端失败: %w", err)
	}
	defer client.Close()

	if err = client.Auth(auth); err != nil {
		return fmt.Errorf("SMTP 认证失败: %w", err)
	}

	if err = client.Mail(from); err != nil {
		return fmt.Errorf("设置发件人失败: %w", err)
	}

	for _, rcpt := range to {
		if err = client.Rcpt(rcpt); err != nil {
			return fmt.Errorf("设置收件人失败: %w", err)
		}
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("准备邮件数据失败: %w", err)
	}

	if _, err = w.Write(message); err != nil {
		return fmt.Errorf("写入邮件数据失败: %w", err)
	}

	if err = w.Close(); err != nil {
		return fmt.Errorf("关闭邮件数据流失败: %w", err)
	}

	return client.Quit()
}

func (s *Service) IsEnabled(ctx context.Context) bool {
	config, err := s.getConfig(ctx)
	return err == nil && config != nil
}

func (s *Service) IsLoginNotificationEnabled(ctx context.Context) bool {
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return false
	}
	return settings["mail.login.notification"] == "true"
}

func (s *Service) IsRegisterVerifyEnabled(ctx context.Context) bool {
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return false
	}
	return settings["mail.register.verify"] == "true"
}

func (s *Service) IsForgotPasswordEnabled(ctx context.Context) bool {
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return false
	}
	return settings["mail.forgot_password.enabled"] == "true"
}

func (s *Service) SendLoginNotification(ctx context.Context, email, userName, ip string) error {
	// 检查是否启用登录通知
	enabled := s.IsLoginNotificationEnabled(ctx)
	if !enabled {
		return fmt.Errorf("登录邮件提醒未启用")
	}

	// 检查 SMTP 配置
	if !s.IsEnabled(ctx) {
		return fmt.Errorf("SMTP 配置不完整或未配置")
	}

	content, err := s.renderConfiguredTemplate(ctx, TemplateLoginNotification, TemplateVariables{
		UserName: userName,
		Email:    email,
		LoginIP:  ip,
	})
	if err != nil {
		return err
	}

	return s.SendMail(ctx, email, content.Subject, content.Body)
}

func (s *Service) SendWelcomeEmail(ctx context.Context, email, userName string) error {
	return s.SendRegistrationSuccessEmail(ctx, email, userName)
}

// 获取客户端 IP 地址
func GetClientIP(c interface{}) string {
	// 这里需要根据实际的 gin.Context 来获取 IP
	// 简化版本，实际使用时需要处理代理等情况
	return "未知"
}

// 格式化 IP 地址显示
func FormatIP(ip string) string {
	if ip == "" || ip == "::1" || ip == "127.0.0.1" {
		return "本地"
	}
	// 移除端口号
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		return ip[:idx]
	}
	return ip
}

func (s *Service) SendVerificationCode(ctx context.Context, email, code string) error {
	// 检查 SMTP 配置
	if !s.IsEnabled(ctx) {
		return fmt.Errorf("SMTP 配置不完整或未配置")
	}

	content, err := s.renderConfiguredTemplate(ctx, TemplateRegisterVerify, TemplateVariables{
		Email:            email,
		VerificationCode: code,
	})
	if err != nil {
		return err
	}

	return s.SendMail(ctx, email, content.Subject, content.Body)
}

func (s *Service) SendRegistrationSuccessEmail(ctx context.Context, email, userName string) error {
	// 检查 SMTP 配置
	if !s.IsEnabled(ctx) {
		return fmt.Errorf("SMTP 配置不完整或未配置")
	}

	content, err := s.renderConfiguredTemplate(ctx, TemplateRegisterSuccess, TemplateVariables{
		UserName: userName,
		Email:    email,
	})
	if err != nil {
		return err
	}

	return s.SendMail(ctx, email, content.Subject, content.Body)
}

func (s *Service) SendPasswordResetEmail(ctx context.Context, email, code, resetLink string) error {
	if !s.IsEnabled(ctx) {
		return fmt.Errorf("SMTP 配置不完整或未配置")
	}
	content, err := s.renderConfiguredTemplate(ctx, TemplateForgotPassword, TemplateVariables{
		Email:            email,
		VerificationCode: code,
		ResetLink:        resetLink,
	})
	if err != nil {
		return err
	}
	return s.SendMail(ctx, email, content.Subject, content.Body)
}

func (s *Service) renderConfiguredTemplate(ctx context.Context, key TemplateKey, vars TemplateVariables) (TemplateContent, error) {
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return TemplateContent{}, fmt.Errorf("获取站点设置失败: %w", err)
	}

	if strings.TrimSpace(vars.SiteName) == "" {
		vars.SiteName = settings["site.title"]
	}

	content := ResolveTemplateContent(settings, key)
	return RenderTemplateContent(content, vars), nil
}
