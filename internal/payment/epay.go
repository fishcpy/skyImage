package payment

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
)

// Epay implements 易支付 / 彩虹易支付 compatible page pay (MD5 sign).
type Epay struct{}

func (Epay) Name() string { return ProviderEpay }

func (Epay) Enabled(settings Settings) bool {
	return settings.Bool("pay.epay.enabled") &&
		settings.Get("pay.epay.api_url") != "" &&
		settings.Get("pay.epay.pid") != "" &&
		settings.Get("pay.epay.key") != ""
}

func (Epay) CreateCheckout(ctx context.Context, settings Settings, req CheckoutRequest) (CheckoutResult, error) {
	_ = ctx
	apiURL := strings.TrimRight(settings.Get("pay.epay.api_url"), "/")
	pid := settings.Get("pay.epay.pid")
	key := settings.Get("pay.epay.key")
	if apiURL == "" || pid == "" || key == "" {
		return CheckoutResult{}, fmt.Errorf("epay not configured")
	}
	payType := strings.TrimSpace(req.EpayType)
	if payType == "" {
		payType = settings.Get("pay.epay.default_type")
	}
	if payType == "" {
		payType = "alipay"
	}

	params := map[string]string{
		"pid":          pid,
		"type":         payType,
		"out_trade_no": req.OrderNo,
		"notify_url":   req.NotifyURL,
		"return_url":   req.ReturnURL,
		"name":         req.Subject,
		"money":        FormatYuan(req.AmountCents),
	}
	if req.ClientIP != "" {
		params["clientip"] = req.ClientIP
	}
	params["sign"] = epaySign(params, key)
	params["sign_type"] = "MD5"

	u, err := url.Parse(apiURL + "/submit.php")
	if err != nil {
		return CheckoutResult{}, err
	}
	q := u.Query()
	for k, v := range params {
		q.Set(k, v)
	}
	u.RawQuery = q.Encode()
	return CheckoutResult{PayURL: u.String()}, nil
}

func (Epay) HandleNotify(r *http.Request, settings Settings, expectedCents int64) (NotifyResult, error) {
	key := settings.Get("pay.epay.key")
	if key == "" {
		return NotifyResult{}, fmt.Errorf("epay key missing")
	}
	if err := r.ParseForm(); err != nil {
		return NotifyResult{}, err
	}
	// Support both GET and POST form.
	values := r.Form
	if len(values) == 0 {
		values = r.URL.Query()
	}
	params := map[string]string{}
	for k, vs := range values {
		if len(vs) > 0 {
			params[k] = vs[0]
		}
	}
	sign := params["sign"]
	if sign == "" {
		return NotifyResult{}, fmt.Errorf("missing sign")
	}
	if !strings.EqualFold(epaySign(params, key), sign) {
		return NotifyResult{}, fmt.Errorf("invalid epay signature")
	}

	status := params["trade_status"]
	paid := status == "TRADE_SUCCESS" || status == "TRADE_FINISHED" || status == "success" || status == "1"
	money := params["money"]
	amountCents := parseYuanToCents(money)
	// Require a parseable amount; missing amount must not fulfill.
	amountOK := amountCents > 0
	if expectedCents > 0 && amountCents > 0 {
		amountOK = amountCents == expectedCents
	}
	return NotifyResult{
		OrderNo:     params["out_trade_no"],
		TradeNo:     firstNonEmpty(params["trade_no"], params["api_trade_no"]),
		Paid:        paid,
		AmountOK:    amountOK,
		AmountCents: amountCents,
		Raw:         values.Encode(),
		RespondOK:   "success",
	}, nil
}

func parseYuanToCents(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	parts := strings.SplitN(s, ".", 2)
	yuan := int64(0)
	fen := int64(0)
	fmt.Sscanf(parts[0], "%d", &yuan)
	if len(parts) == 2 {
		frac := parts[1]
		if len(frac) == 1 {
			frac += "0"
		}
		if len(frac) > 2 {
			frac = frac[:2]
		}
		fmt.Sscanf(frac, "%d", &fen)
	}
	if yuan < 0 {
		return yuan*100 - fen
	}
	return yuan*100 + fen
}

func epaySign(params map[string]string, key string) string {
	keys := make([]string, 0, len(params))
	for k, v := range params {
		if k == "sign" || k == "sign_type" || v == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('&')
		}
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(params[k])
	}
	b.WriteString(key)
	sum := md5.Sum([]byte(b.String()))
	return hex.EncodeToString(sum[:])
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
