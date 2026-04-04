package mail

import (
	"strings"
	"time"
)

type TemplateKey string

const (
	TemplateTestSMTP          TemplateKey = "test_smtp"
	TemplateRegisterVerify    TemplateKey = "register_verify"
	TemplateRegisterSuccess   TemplateKey = "register_success"
	TemplateLoginNotification TemplateKey = "login_notification"
	TemplateForgotPassword    TemplateKey = "forgot_password"
)

type TemplateContent struct {
	Subject string
	Body    string
}

type TemplateVariables struct {
	SiteName         string
	UserName         string
	Email            string
	VerificationCode string
	ResetLink        string
	LoginIP          string
	TestEmail        string
	CurrentTime      string
}

type templateDefinition struct {
	SubjectSettingKey string
	BodySettingKey    string
	Default           TemplateContent
}

var templateDefinitions = map[TemplateKey]templateDefinition{
	TemplateTestSMTP: {
		SubjectSettingKey: "mail.template.test.subject",
		BodySettingKey:    "mail.template.test.body",
		Default: TemplateContent{
			Subject: "{{site_name}} 邮件测试",
			Body:    "如果你看到这条消息代表邮件已正常可用",
		},
	},
	TemplateRegisterVerify: {
		SubjectSettingKey: "mail.template.register_verify.subject",
		BodySettingKey:    "mail.template.register_verify.body",
		Default: TemplateContent{
			Subject: "{{site_name}} 注册验证码",
			Body: `您好，

您正在注册 {{site_name}}

您的验证码是：{{verification_code}}

验证码有效期为 5 分钟，请尽快完成验证。

如果这不是您本人的操作，请忽略此邮件。

此邮件由系统自动发送，请勿回复。`,
		},
	},
	TemplateRegisterSuccess: {
		SubjectSettingKey: "mail.template.register_success.subject",
		BodySettingKey:    "mail.template.register_success.body",
		Default: TemplateContent{
			Subject: "欢迎注册 {{site_name}}",
			Body: `您好 {{user_name}}，

恭喜您成功注册 {{site_name}} 成功！

您的账号已激活，现在可以开始使用我们的服务了。

如有任何问题，请联系管理员。

此邮件由系统自动发送，请勿回复。`,
		},
	},
	TemplateLoginNotification: {
		SubjectSettingKey: "mail.template.login_notification.subject",
		BodySettingKey:    "mail.template.login_notification.body",
		Default: TemplateContent{
			Subject: "{{site_name}} 登录提醒",
			Body: `您好 {{user_name}}，

您的账号刚刚登录了 {{site_name}}。

登录信息：
- 登录 IP：{{login_ip}}

如果这不是您本人的操作，请立即修改密码并联系管理员。

此邮件由系统自动发送，请勿回复。`,
		},
	},
	TemplateForgotPassword: {
		SubjectSettingKey: "mail.template.forgot_password.subject",
		BodySettingKey:    "mail.template.forgot_password.body",
		Default: TemplateContent{
			Subject: "{{site_name}} 密码重置验证码",
			Body: `您好，

您正在重置 {{site_name}} 的登录密码。

验证码：{{verification_code}}
重置链接：{{reset_link}}

验证码和链接有效期为 15 分钟。
如果这不是您本人的操作，请忽略此邮件。

此邮件由系统自动发送，请勿回复。`,
		},
	},
}

func ResolveTemplateContent(settings map[string]string, key TemplateKey) TemplateContent {
	content := defaultTemplateContent(key)
	def, ok := templateDefinitions[key]
	if !ok || settings == nil {
		return content
	}

	if value, exists := settings[def.SubjectSettingKey]; exists && strings.TrimSpace(value) != "" {
		content.Subject = value
	}
	if value, exists := settings[def.BodySettingKey]; exists && strings.TrimSpace(value) != "" {
		content.Body = value
	}

	return content
}

func MergeTemplateContent(key TemplateKey, subject, body string) TemplateContent {
	content := defaultTemplateContent(key)
	if strings.TrimSpace(subject) != "" {
		content.Subject = subject
	}
	if strings.TrimSpace(body) != "" {
		content.Body = body
	}
	return content
}

func RenderTemplateContent(content TemplateContent, vars TemplateVariables) TemplateContent {
	replacements := buildTemplateReplacements(vars)
	return TemplateContent{
		Subject: renderTemplateText(content.Subject, replacements),
		Body:    renderTemplateText(content.Body, replacements),
	}
}

func defaultTemplateContent(key TemplateKey) TemplateContent {
	def, ok := templateDefinitions[key]
	if !ok {
		return TemplateContent{}
	}
	return def.Default
}

func buildTemplateReplacements(vars TemplateVariables) map[string]string {
	siteName := strings.TrimSpace(vars.SiteName)
	if siteName == "" {
		siteName = "skyImage"
	}

	currentTime := strings.TrimSpace(vars.CurrentTime)
	if currentTime == "" {
		currentTime = time.Now().Format("2006-01-02 15:04:05")
	}

	return map[string]string{
		"site_name":         siteName,
		"user_name":         strings.TrimSpace(vars.UserName),
		"email":             strings.TrimSpace(vars.Email),
		"verification_code": strings.TrimSpace(vars.VerificationCode),
		"reset_link":        strings.TrimSpace(vars.ResetLink),
		"login_ip":          strings.TrimSpace(vars.LoginIP),
		"test_email":        strings.TrimSpace(vars.TestEmail),
		"current_time":      currentTime,
	}
}

func renderTemplateText(input string, replacements map[string]string) string {
	output := input
	for key, value := range replacements {
		output = strings.ReplaceAll(output, "{{"+key+"}}", value)
	}
	return output
}
