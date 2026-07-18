package mail

import (
	"strings"
	"time"
	"unicode"
)

type TemplateKey string

const (
	TemplateTestSMTP          TemplateKey = "test_smtp"
	TemplateRegisterVerify    TemplateKey = "register_verify"
	TemplateRegisterSuccess   TemplateKey = "register_success"
	TemplateLoginNotification TemplateKey = "login_notification"
	TemplateForgotPassword    TemplateKey = "forgot_password"
	TemplateTicketCreated     TemplateKey = "ticket_created"
	TemplateTicketReplyUser   TemplateKey = "ticket_reply_user"
	TemplateTicketReplyAdmin  TemplateKey = "ticket_reply_admin"
	TemplateTicketStatus      TemplateKey = "ticket_status"
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
	TicketNo         string
	TicketSubject    string
	TicketStatus     string
	TicketPriority   string
	TicketURL        string
	ReplyBody        string
	StaffName        string
	AdminName        string
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
	TemplateTicketCreated: {
		SubjectSettingKey: "mail.template.ticket_created.subject",
		BodySettingKey:    "mail.template.ticket_created.body",
		Default: TemplateContent{
			Subject: "[{{site_name}}] 新工单 {{ticket_no}}",
			Body: `您好 {{admin_name}}，

用户 {{user_name}} 提交了新工单。

工单编号：{{ticket_no}}
标题：{{ticket_subject}}
优先级：{{ticket_priority}}

处理入口：{{ticket_url}}

此邮件由系统自动发送，请勿回复。`,
		},
	},
	TemplateTicketReplyUser: {
		SubjectSettingKey: "mail.template.ticket_reply_user.subject",
		BodySettingKey:    "mail.template.ticket_reply_user.body",
		Default: TemplateContent{
			Subject: "[{{site_name}}] 工单 {{ticket_no}} 有新回复",
			Body: `您好 {{user_name}}，

您的工单有新的工作人员回复。

工单编号：{{ticket_no}}
标题：{{ticket_subject}}
工作人员：{{staff_name}}

回复内容：
{{reply_body}}

查看工单：{{ticket_url}}

此邮件由系统自动发送，请勿回复。`,
		},
	},
	TemplateTicketReplyAdmin: {
		SubjectSettingKey: "mail.template.ticket_reply_admin.subject",
		BodySettingKey:    "mail.template.ticket_reply_admin.body",
		Default: TemplateContent{
			Subject: "[{{site_name}}] 工单 {{ticket_no}} 用户回复",
			Body: `您好 {{admin_name}}，

工单收到用户回复。

工单编号：{{ticket_no}}
标题：{{ticket_subject}}
用户：{{user_name}}

回复内容：
{{reply_body}}

处理入口：{{ticket_url}}

此邮件由系统自动发送，请勿回复。`,
		},
	},
	TemplateTicketStatus: {
		SubjectSettingKey: "mail.template.ticket_status.subject",
		BodySettingKey:    "mail.template.ticket_status.body",
		Default: TemplateContent{
			Subject: "[{{site_name}}] 工单 {{ticket_no}} 状态更新",
			Body: `您好 {{user_name}}，

您的工单状态已更新。

工单编号：{{ticket_no}}
标题：{{ticket_subject}}
当前状态：{{ticket_status}}

查看工单：{{ticket_url}}

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

// sanitizeTemplateValue removes control characters that could pollute headers/body structure.
func sanitizeTemplateValue(val string) string {
	val = strings.Map(func(r rune) rune {
		if r == '\t' {
			return r
		}
		if r == '\r' || r == '\n' || r == '\x00' || unicode.IsControl(r) {
			return -1
		}
		return r
	}, val)
	return strings.TrimSpace(val)
}

func buildTemplateReplacements(vars TemplateVariables) map[string]string {
	siteName := sanitizeTemplateValue(vars.SiteName)
	if siteName == "" {
		siteName = "skyImage"
	}

	currentTime := sanitizeTemplateValue(vars.CurrentTime)
	if currentTime == "" {
		currentTime = time.Now().Format("2006-01-02 15:04:05")
	}

	return map[string]string{
		"site_name":         siteName,
		"user_name":         sanitizeTemplateValue(vars.UserName),
		"email":             sanitizeTemplateValue(vars.Email),
		"verification_code": sanitizeTemplateValue(vars.VerificationCode),
		"reset_link":        sanitizeTemplateValue(vars.ResetLink),
		"login_ip":          sanitizeTemplateValue(vars.LoginIP),
		"test_email":        sanitizeTemplateValue(vars.TestEmail),
		"current_time":      currentTime,
		"ticket_no":         sanitizeTemplateValue(vars.TicketNo),
		"ticket_subject":    sanitizeTemplateValue(vars.TicketSubject),
		"ticket_status":     sanitizeTemplateValue(vars.TicketStatus),
		"ticket_priority":   sanitizeTemplateValue(vars.TicketPriority),
		"ticket_url":        sanitizeTemplateValue(vars.TicketURL),
		"reply_body":        strings.TrimSpace(vars.ReplyBody),
		"staff_name":        sanitizeTemplateValue(vars.StaffName),
		"admin_name":        sanitizeTemplateValue(vars.AdminName),
	}
}

func renderTemplateText(input string, replacements map[string]string) string {
	output := input
	for key, value := range replacements {
		output = strings.ReplaceAll(output, "{{"+key+"}}", value)
	}
	return output
}
