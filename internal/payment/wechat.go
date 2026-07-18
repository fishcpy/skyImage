package payment

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sort"
	"strings"
)

// Wechat implements WeChat Pay Native (scan) using unified order API v2.
type Wechat struct{}

func (Wechat) Name() string { return ProviderWechat }

func (Wechat) Enabled(settings Settings) bool {
	return settings.Bool("pay.wechat.enabled") &&
		settings.Get("pay.wechat.app_id") != "" &&
		settings.Get("pay.wechat.mch_id") != "" &&
		settings.Get("pay.wechat.api_key") != ""
}

type wechatUnifiedRequest struct {
	XMLName        xml.Name `xml:"xml"`
	AppID          string   `xml:"appid"`
	MchID          string   `xml:"mch_id"`
	NonceStr       string   `xml:"nonce_str"`
	Sign           string   `xml:"sign"`
	Body           string   `xml:"body"`
	OutTradeNo     string   `xml:"out_trade_no"`
	TotalFee       int64    `xml:"total_fee"`
	SpbillCreateIP string   `xml:"spbill_create_ip"`
	NotifyURL      string   `xml:"notify_url"`
	TradeType      string   `xml:"trade_type"`
}

type wechatUnifiedResponse struct {
	ReturnCode string `xml:"return_code"`
	ReturnMsg  string `xml:"return_msg"`
	ResultCode string `xml:"result_code"`
	ErrCodeDes string `xml:"err_code_des"`
	CodeURL    string `xml:"code_url"`
	PrepayID   string `xml:"prepay_id"`
}

func (Wechat) CreateCheckout(ctx context.Context, settings Settings, req CheckoutRequest) (CheckoutResult, error) {
	appID := settings.Get("pay.wechat.app_id")
	mchID := settings.Get("pay.wechat.mch_id")
	apiKey := settings.Get("pay.wechat.api_key")
	ip := req.ClientIP
	if ip == "" {
		ip = "127.0.0.1"
	}
	nonce := randomNonce(16)
	params := map[string]string{
		"appid":            appID,
		"mch_id":           mchID,
		"nonce_str":        nonce,
		"body":             req.Subject,
		"out_trade_no":     req.OrderNo,
		"total_fee":        fmt.Sprintf("%d", req.AmountCents),
		"spbill_create_ip": ip,
		"notify_url":       req.NotifyURL,
		"trade_type":       "NATIVE",
	}
	sign := wechatSign(params, apiKey)
	body := wechatUnifiedRequest{
		AppID:          appID,
		MchID:          mchID,
		NonceStr:       nonce,
		Sign:           sign,
		Body:           req.Subject,
		OutTradeNo:     req.OrderNo,
		TotalFee:       req.AmountCents,
		SpbillCreateIP: ip,
		NotifyURL:      req.NotifyURL,
		TradeType:      "NATIVE",
	}
	xmlBody, err := xml.Marshal(body)
	if err != nil {
		return CheckoutResult{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.mch.weixin.qq.com/pay/unifiedorder", bytes.NewReader(xmlBody))
	if err != nil {
		return CheckoutResult{}, err
	}
	httpReq.Header.Set("Content-Type", "application/xml")
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return CheckoutResult{}, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return CheckoutResult{}, err
	}
	var parsed wechatUnifiedResponse
	if err := xml.Unmarshal(raw, &parsed); err != nil {
		return CheckoutResult{}, err
	}
	if parsed.ReturnCode != "SUCCESS" {
		return CheckoutResult{}, fmt.Errorf("wechat return: %s", parsed.ReturnMsg)
	}
	if parsed.ResultCode != "SUCCESS" {
		return CheckoutResult{}, fmt.Errorf("wechat result: %s", parsed.ErrCodeDes)
	}
	return CheckoutResult{
		QRContent: parsed.CodeURL,
		Extra:     map[string]string{"prepayId": parsed.PrepayID},
	}, nil
}

type wechatNotify struct {
	ReturnCode    string `xml:"return_code"`
	ResultCode    string `xml:"result_code"`
	OutTradeNo    string `xml:"out_trade_no"`
	TransactionID string `xml:"transaction_id"`
	TotalFee      int64  `xml:"total_fee"`
	Sign          string `xml:"sign"`
}

func (Wechat) HandleNotify(r *http.Request, settings Settings, expectedCents int64) (NotifyResult, error) {
	apiKey := settings.Get("pay.wechat.api_key")
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return NotifyResult{}, err
	}
	// Parse into map for signing.
	type kv struct {
		XMLName xml.Name
		Value   string `xml:",chardata"`
	}
	// Use generic decode of all fields via map from xml tokens.
	params, err := xmlToMap(raw)
	if err != nil {
		return NotifyResult{}, err
	}
	sign := params["sign"]
	if sign == "" {
		return NotifyResult{}, fmt.Errorf("missing sign")
	}
	if !strings.EqualFold(wechatSign(params, apiKey), sign) {
		return NotifyResult{}, fmt.Errorf("invalid wechat signature")
	}
	paid := params["return_code"] == "SUCCESS" && params["result_code"] == "SUCCESS"
	var amountCents int64
	if params["total_fee"] != "" {
		fmt.Sscanf(params["total_fee"], "%d", &amountCents)
	}
	amountOK := amountCents > 0
	if expectedCents > 0 && amountCents > 0 {
		amountOK = amountCents == expectedCents
	}
	return NotifyResult{
		OrderNo:     params["out_trade_no"],
		TradeNo:     params["transaction_id"],
		Paid:        paid,
		AmountOK:    amountOK,
		AmountCents: amountCents,
		Raw:         string(raw),
		RespondOK:   `<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>`,
	}, nil
}

func wechatSign(params map[string]string, apiKey string) string {
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
	b.WriteString("&key=")
	b.WriteString(apiKey)
	sum := md5.Sum([]byte(b.String()))
	return strings.ToUpper(hex.EncodeToString(sum[:]))
}

func xmlToMap(raw []byte) (map[string]string, error) {
	dec := xml.NewDecoder(bytes.NewReader(raw))
	out := map[string]string{}
	var cur string
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			cur = t.Name.Local
		case xml.CharData:
			if cur != "" && cur != "xml" {
				v := strings.TrimSpace(string(t))
				if v != "" {
					out[cur] = v
				}
			}
		case xml.EndElement:
			cur = ""
		}
	}
	return out, nil
}

func randomNonce(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	max := big.NewInt(int64(len(letters)))
	for i := range b {
		v, err := rand.Int(rand.Reader, max)
		if err != nil {
			// Extremely unlikely; fall back to deterministic-safe zero is worse than retry once.
			b[i] = letters[0]
			continue
		}
		b[i] = letters[v.Int64()]
	}
	return string(b)
}
