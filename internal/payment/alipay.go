package payment

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// Alipay implements Alipay page pay (alipay.trade.page.pay) with RSA2.
type Alipay struct{}

func (Alipay) Name() string { return ProviderAlipay }

func (Alipay) Enabled(settings Settings) bool {
	return settings.Bool("pay.alipay.enabled") &&
		settings.Get("pay.alipay.app_id") != "" &&
		settings.Get("pay.alipay.private_key") != "" &&
		settings.Get("pay.alipay.alipay_public_key") != ""
}

func (Alipay) CreateCheckout(ctx context.Context, settings Settings, req CheckoutRequest) (CheckoutResult, error) {
	_ = ctx
	appID := settings.Get("pay.alipay.app_id")
	gateway := settings.Get("pay.alipay.gateway")
	if gateway == "" {
		gateway = "https://openapi.alipay.com/gateway.do"
	}
	privPEM := settings.Get("pay.alipay.private_key")
	priv, err := parseRSAPrivateKey(privPEM)
	if err != nil {
		return CheckoutResult{}, fmt.Errorf("alipay private key: %w", err)
	}

	biz, _ := json.Marshal(map[string]string{
		"out_trade_no": req.OrderNo,
		"product_code": "FAST_INSTANT_TRADE_PAY",
		"total_amount": FormatYuan(req.AmountCents),
		"subject":      req.Subject,
	})
	params := map[string]string{
		"app_id":      appID,
		"method":      "alipay.trade.page.pay",
		"format":      "JSON",
		"charset":     "utf-8",
		"sign_type":   "RSA2",
		"timestamp":   time.Now().Format("2006-01-02 15:04:05"),
		"version":     "1.0",
		"notify_url":  req.NotifyURL,
		"return_url":  req.ReturnURL,
		"biz_content": string(biz),
	}
	sign, err := rsa2Sign(params, priv)
	if err != nil {
		return CheckoutResult{}, err
	}
	params["sign"] = sign

	u, err := url.Parse(gateway)
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

func (Alipay) HandleNotify(r *http.Request, settings Settings, expectedCents int64) (NotifyResult, error) {
	pubPEM := settings.Get("pay.alipay.alipay_public_key")
	pub, err := parseRSAPublicKey(pubPEM)
	if err != nil {
		return NotifyResult{}, fmt.Errorf("alipay public key: %w", err)
	}
	if err := r.ParseForm(); err != nil {
		return NotifyResult{}, err
	}
	params := map[string]string{}
	for k, vs := range r.Form {
		if len(vs) > 0 {
			params[k] = vs[0]
		}
	}
	sign := params["sign"]
	signType := params["sign_type"]
	if sign == "" {
		return NotifyResult{}, fmt.Errorf("missing sign")
	}
	if signType != "" && !strings.EqualFold(signType, "RSA2") {
		return NotifyResult{}, fmt.Errorf("unsupported sign_type")
	}
	if err := rsa2Verify(params, sign, pub); err != nil {
		return NotifyResult{}, err
	}
	status := params["trade_status"]
	paid := status == "TRADE_SUCCESS" || status == "TRADE_FINISHED"
	amountCents := parseYuanToCents(params["total_amount"])
	amountOK := amountCents > 0
	if expectedCents > 0 && amountCents > 0 {
		amountOK = amountCents == expectedCents
	}
	return NotifyResult{
		OrderNo:     params["out_trade_no"],
		TradeNo:     params["trade_no"],
		Paid:        paid,
		AmountOK:    amountOK,
		AmountCents: amountCents,
		Raw:         r.Form.Encode(),
		RespondOK:   "success",
	}, nil
}

func parseRSAPrivateKey(pemStr string) (*rsa.PrivateKey, error) {
	pemStr = normalizePEM(pemStr, "RSA PRIVATE KEY")
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, fmt.Errorf("invalid private key pem")
	}
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("not rsa private key")
	}
	return key, nil
}

func parseRSAPublicKey(pemStr string) (*rsa.PublicKey, error) {
	pemStr = normalizePEM(pemStr, "PUBLIC KEY")
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, fmt.Errorf("invalid public key pem")
	}
	if pub, err := x509.ParsePKIXPublicKey(block.Bytes); err == nil {
		key, ok := pub.(*rsa.PublicKey)
		if !ok {
			return nil, fmt.Errorf("not rsa public key")
		}
		return key, nil
	}
	// Try PKCS1 public key
	key, err := x509.ParsePKCS1PublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	return key, nil
}

func normalizePEM(raw, typ string) string {
	s := strings.TrimSpace(raw)
	if strings.Contains(s, "BEGIN") {
		return s
	}
	// bare base64 body
	var b strings.Builder
	b.WriteString("-----BEGIN " + typ + "-----\n")
	for i := 0; i < len(s); i += 64 {
		end := i + 64
		if end > len(s) {
			end = len(s)
		}
		b.WriteString(s[i:end])
		b.WriteByte('\n')
	}
	b.WriteString("-----END " + typ + "-----")
	return b.String()
}

func rsa2SignContent(params map[string]string) string {
	keys := make([]string, 0, len(params))
	for k, v := range params {
		if k == "sign" || v == "" {
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
	return b.String()
}

func rsa2Sign(params map[string]string, priv *rsa.PrivateKey) (string, error) {
	content := rsa2SignContent(params)
	h := sha256.Sum256([]byte(content))
	sig, err := rsa.SignPKCS1v15(rand.Reader, priv, crypto.SHA256, h[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(sig), nil
}

func rsa2Verify(params map[string]string, sign string, pub *rsa.PublicKey) error {
	content := rsa2SignContent(params)
	sig, err := base64.StdEncoding.DecodeString(sign)
	if err != nil {
		return err
	}
	h := sha256.Sum256([]byte(content))
	return rsa.VerifyPKCS1v15(pub, crypto.SHA256, h[:], sig)
}
