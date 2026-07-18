package payment

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Shared HTTP client with timeout for provider API calls.
var httpClient = &http.Client{Timeout: 15 * time.Second}

const (
	ProviderEpay   = "epay"
	ProviderAlipay = "alipay"
	ProviderWechat = "wechat"
	ProviderStripe = "stripe"
)

// Settings is a subset of site configs used by payment providers.
type Settings map[string]string

func (s Settings) Get(key string) string {
	if s == nil {
		return ""
	}
	return strings.TrimSpace(s[key])
}

func (s Settings) Bool(key string) bool {
	return s.Get(key) == "true"
}

// CheckoutRequest is sent to a provider to start payment.
type CheckoutRequest struct {
	OrderNo     string
	Subject     string
	AmountCents int64
	Currency    string
	ReturnURL   string
	NotifyURL   string
	ClientIP    string
	// Optional channel hint for epay: alipay / wxpay / qqpay
	EpayType string
}

// CheckoutResult is the redirect / client payload for the buyer.
type CheckoutResult struct {
	PayURL    string            `json:"payUrl,omitempty"`
	QRContent string            `json:"qrContent,omitempty"`
	Extra     map[string]string `json:"extra,omitempty"`
}

// NotifyResult is the normalized outcome of an async payment notification.
type NotifyResult struct {
	OrderNo     string
	TradeNo     string
	Paid        bool
	AmountOK    bool
	AmountCents int64  // paid amount in minor units when known; 0 if unknown
	Raw         string
	RespondOK   string // body to write on success (e.g. "success")
}

// Provider abstracts a payment channel.
type Provider interface {
	Name() string
	Enabled(settings Settings) bool
	CreateCheckout(ctx context.Context, settings Settings, req CheckoutRequest) (CheckoutResult, error)
	HandleNotify(r *http.Request, settings Settings, expectedCents int64) (NotifyResult, error)
}

func NormalizeProvider(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func Get(name string) (Provider, error) {
	switch NormalizeProvider(name) {
	case ProviderEpay:
		return Epay{}, nil
	case ProviderAlipay:
		return Alipay{}, nil
	case ProviderWechat:
		return Wechat{}, nil
	case ProviderStripe:
		return Stripe{}, nil
	default:
		return nil, fmt.Errorf("unsupported payment provider: %s", name)
	}
}

func ListProviders() []string {
	return []string{ProviderEpay, ProviderAlipay, ProviderWechat, ProviderStripe}
}

// EnabledProviders returns configured-and-enabled provider names.
func EnabledProviders(settings Settings) []string {
	var out []string
	if !settings.Bool("pay.enabled") {
		return out
	}
	for _, name := range ListProviders() {
		p, err := Get(name)
		if err != nil {
			continue
		}
		if p.Enabled(settings) {
			out = append(out, name)
		}
	}
	return out
}

// FormatYuan converts fen to yuan string with 2 decimals (for epay/alipay).
func FormatYuan(cents int64) string {
	neg := cents < 0
	if neg {
		cents = -cents
	}
	yuan := cents / 100
	fen := cents % 100
	s := fmt.Sprintf("%d.%02d", yuan, fen)
	if neg {
		return "-" + s
	}
	return s
}
