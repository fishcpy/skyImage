package payment

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Stripe implements Stripe Checkout Session + webhook verify.
type Stripe struct{}

func (Stripe) Name() string { return ProviderStripe }

func (Stripe) Enabled(settings Settings) bool {
	// Webhook secret is required so notify handlers never accept unsigned payloads.
	return settings.Bool("pay.stripe.enabled") &&
		settings.Get("pay.stripe.secret_key") != "" &&
		settings.Get("pay.stripe.webhook_secret") != ""
}

func (Stripe) CreateCheckout(ctx context.Context, settings Settings, req CheckoutRequest) (CheckoutResult, error) {
	secret := settings.Get("pay.stripe.secret_key")
	currency := strings.ToLower(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "cny"
	}
	form := url.Values{}
	form.Set("mode", "payment")
	form.Set("success_url", req.ReturnURL+"?order_no="+url.QueryEscape(req.OrderNo)+"&session_id={CHECKOUT_SESSION_ID}")
	form.Set("cancel_url", req.ReturnURL+"?order_no="+url.QueryEscape(req.OrderNo)+"&canceled=1")
	form.Set("client_reference_id", req.OrderNo)
	form.Set("metadata[order_no]", req.OrderNo)
	form.Set("line_items[0][price_data][currency]", currency)
	form.Set("line_items[0][price_data][product_data][name]", req.Subject)
	form.Set("line_items[0][price_data][unit_amount]", strconv.FormatInt(req.AmountCents, 10))
	form.Set("line_items[0][quantity]", "1")

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.stripe.com/v1/checkout/sessions", strings.NewReader(form.Encode()))
	if err != nil {
		return CheckoutResult{}, err
	}
	httpReq.SetBasicAuth(secret, "")
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return CheckoutResult{}, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return CheckoutResult{}, err
	}
	if resp.StatusCode >= 300 {
		return CheckoutResult{}, fmt.Errorf("stripe session: %s", strings.TrimSpace(string(raw)))
	}
	var parsed struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return CheckoutResult{}, err
	}
	if parsed.URL == "" {
		return CheckoutResult{}, fmt.Errorf("stripe session missing url")
	}
	return CheckoutResult{
		PayURL: parsed.URL,
		Extra:  map[string]string{"sessionId": parsed.ID},
	}, nil
}

func (Stripe) HandleNotify(r *http.Request, settings Settings, expectedCents int64) (NotifyResult, error) {
	secret := settings.Get("pay.stripe.webhook_secret")
	if secret == "" {
		return NotifyResult{}, fmt.Errorf("stripe webhook secret required")
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return NotifyResult{}, err
	}
	// Restore body for potential re-read (not needed further).
	r.Body = io.NopCloser(bytes.NewReader(raw))

	if err := verifyStripeSignature(r.Header.Get("Stripe-Signature"), raw, secret); err != nil {
		return NotifyResult{}, err
	}

	var event struct {
		Type string `json:"type"`
		Data struct {
			Object json.RawMessage `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &event); err != nil {
		return NotifyResult{}, err
	}
	if event.Type != "checkout.session.completed" && event.Type != "checkout.session.async_payment_succeeded" {
		return NotifyResult{Paid: false, AmountOK: false, Raw: string(raw), RespondOK: "ok"}, nil
	}
	var session struct {
		ID                string            `json:"id"`
		PaymentStatus     string            `json:"payment_status"`
		ClientReferenceID string            `json:"client_reference_id"`
		AmountTotal       int64             `json:"amount_total"`
		Metadata          map[string]string `json:"metadata"`
		PaymentIntent     string            `json:"payment_intent"`
	}
	if err := json.Unmarshal(event.Data.Object, &session); err != nil {
		return NotifyResult{}, err
	}
	orderNo := session.ClientReferenceID
	if orderNo == "" && session.Metadata != nil {
		orderNo = session.Metadata["order_no"]
	}
	paid := session.PaymentStatus == "paid" || session.PaymentStatus == "no_payment_required"
	amountOK := session.AmountTotal > 0
	if expectedCents > 0 && session.AmountTotal > 0 {
		amountOK = session.AmountTotal == expectedCents
	}
	return NotifyResult{
		OrderNo:     orderNo,
		TradeNo:     firstNonEmpty(session.PaymentIntent, session.ID),
		Paid:        paid,
		AmountOK:    amountOK,
		AmountCents: session.AmountTotal,
		Raw:         string(raw),
		RespondOK:   "ok",
	}, nil
}

func verifyStripeSignature(header string, payload []byte, secret string) error {
	// Stripe-Signature: t=timestamp,v1=signature
	var ts string
	var sigs []string
	for _, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "t=") {
			ts = strings.TrimPrefix(part, "t=")
		}
		if strings.HasPrefix(part, "v1=") {
			sigs = append(sigs, strings.TrimPrefix(part, "v1="))
		}
	}
	if ts == "" || len(sigs) == 0 {
		return fmt.Errorf("invalid stripe signature header")
	}
	tsInt, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid stripe timestamp")
	}
	if abs64(time.Now().Unix()-tsInt) > 300 {
		return fmt.Errorf("stripe timestamp too old")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(ts + "." + string(payload)))
	expected := hex.EncodeToString(mac.Sum(nil))
	for _, s := range sigs {
		if hmac.Equal([]byte(expected), []byte(s)) {
			return nil
		}
	}
	return fmt.Errorf("stripe signature mismatch")
}

func abs64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}
