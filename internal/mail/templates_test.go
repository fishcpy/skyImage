package mail

import "testing"

func TestResolveTemplateContentFallsBackToDefaults(t *testing.T) {
	content := ResolveTemplateContent(nil, TemplateRegisterVerify)

	if content.Subject != "{{site_name}} 注册验证码" {
		t.Fatalf("unexpected default subject: %q", content.Subject)
	}
	if content.Body == "" {
		t.Fatal("expected default body")
	}
}

func TestResolveTemplateContentUsesStoredValues(t *testing.T) {
	content := ResolveTemplateContent(map[string]string{
		"mail.template.login_notification.subject": "自定义主题 {{site_name}}",
		"mail.template.login_notification.body":    "您好 {{user_name}}，IP={{login_ip}}",
	}, TemplateLoginNotification)

	if content.Subject != "自定义主题 {{site_name}}" {
		t.Fatalf("unexpected stored subject: %q", content.Subject)
	}
	if content.Body != "您好 {{user_name}}，IP={{login_ip}}" {
		t.Fatalf("unexpected stored body: %q", content.Body)
	}
}

func TestRenderTemplateContentReplacesVariables(t *testing.T) {
	rendered := RenderTemplateContent(
		TemplateContent{
			Subject: "{{site_name}} 登录提醒",
			Body:    "{{user_name}}|{{email}}|{{login_ip}}|{{current_time}}",
		},
		TemplateVariables{
			SiteName:    "Demo",
			UserName:    "alice",
			Email:       "alice@example.com",
			LoginIP:     "127.0.0.1",
			CurrentTime: "2026-04-04 12:34:56",
		},
	)

	if rendered.Subject != "Demo 登录提醒" {
		t.Fatalf("unexpected rendered subject: %q", rendered.Subject)
	}
	if rendered.Body != "alice|alice@example.com|127.0.0.1|2026-04-04 12:34:56" {
		t.Fatalf("unexpected rendered body: %q", rendered.Body)
	}
}

func TestMergeTemplateContentUsesDefaultsForBlankOverrides(t *testing.T) {
	content := MergeTemplateContent(TemplateTestSMTP, "", "  ")

	if content.Subject != "{{site_name}} 邮件测试" {
		t.Fatalf("unexpected merged subject: %q", content.Subject)
	}
	if content.Body != "如果你看到这条消息代表邮件已正常可用" {
		t.Fatalf("unexpected merged body: %q", content.Body)
	}
}
