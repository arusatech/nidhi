package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

const (
	nsBal   = "bal"
	nsNonce = "nonce"
	nsTx    = "tx"
)

// State is the world-state subset the Nidhi ledger needs (shim or in-memory).
type State interface {
	Get(key string) ([]byte, error)
	Put(key string, value []byte) error
	GetByPrefix(prefix string) ([][]byte, error)
}

func composite(ns string, parts ...string) string {
	return ns + "\x00" + strings.Join(parts, "\x00")
}

func balKey(accountID, tokenID string) string {
	return composite(nsBal, accountID, tokenID)
}

func nonceKey(from, nonce string) string {
	return composite(nsNonce, from, nonce)
}

func txKey(accountID, timestamp, txID string) string {
	return composite(nsTx, accountID, timestamp, txID)
}

type TxRecord struct {
	TxID                string            `json:"txId"`
	From                string            `json:"from"`
	To                  string            `json:"to"`
	Amount              string            `json:"amount"`
	TokenID             string            `json:"tokenId"`
	Timestamp           int64             `json:"timestamp"`
	Nonce               string            `json:"nonce"`
	Particulars         string            `json:"particulars,omitempty"`
	ChequeOrRefNo       string            `json:"chequeOrRefNo,omitempty"`
	Initials            string            `json:"initials,omitempty"`
	BalanceBefore       string            `json:"balanceBefore,omitempty"`
	BalanceAfter        string            `json:"balanceAfter,omitempty"`
	AddressCommitments  map[string]string `json:"addressCommitments,omitempty"`
	GeoSource           string            `json:"geoSource,omitempty"`
	GeoCommitment       string            `json:"geoCommitment,omitempty"`
}

type SubmitResult struct {
	TxID   string `json:"txId"`
	Status string `json:"status"`
	Reason string `json:"reason,omitempty"`
}

type Balance struct {
	AccountID string `json:"accountId"`
	TokenID   string `json:"tokenId"`
	Amount    string `json:"amount"`
}

func getBalanceAmount(st State, accountID, tokenID string) (string, error) {
	raw, err := st.Get(balKey(accountID, tokenID))
	if err != nil {
		return "", err
	}
	if len(raw) == 0 {
		return "0", nil
	}
	return string(raw), nil
}

func putBalance(st State, accountID, tokenID, amount string) error {
	return st.Put(balKey(accountID, tokenID), []byte(amount))
}

func transferSigningBody(m map[string]any) map[string]any {
	return map[string]any{
		"from":      asString(m["from"]),
		"to":        asString(m["to"]),
		"amount":    asString(m["amount"]),
		"tokenId":   asString(m["tokenId"]),
		"nonce":     asString(m["nonce"]),
		"timestamp": asInt64(m["timestamp"]),
	}
}

func receiptSigningBody(m map[string]any) map[string]any {
	body := map[string]any{
		"kind":          asString(m["kind"]),
		"from":          asString(m["from"]),
		"to":            asString(m["to"]),
		"amount":        asString(m["amount"]),
		"tokenId":       asString(m["tokenId"]),
		"nonce":         asString(m["nonce"]),
		"timestamp":     asInt64(m["timestamp"]),
		"particulars":   asString(m["particulars"]),
		"chequeOrRefNo": asString(m["chequeOrRefNo"]),
		"balanceBefore": asString(m["balanceBefore"]),
		"balanceAfter":  asString(m["balanceAfter"]),
	}
	if v := asString(m["noteId"]); v != "" {
		body["noteId"] = v
	}
	if v := asString(m["initials"]); v != "" {
		body["initials"] = v
	}
	if ac, ok := m["addressCommitments"].(map[string]any); ok && len(ac) > 0 {
		body["addressCommitments"] = ac
	}
	if v := asString(m["geoSource"]); v != "" {
		body["geoSource"] = v
	}
	if v := asString(m["geoCommitment"]); v != "" {
		body["geoCommitment"] = v
	}
	return body
}

func verifyUserTransfer(m map[string]any, receipt bool) error {
	from := asString(m["from"])
	to := asString(m["to"])
	amount := asString(m["amount"])
	pub := asString(m["publicKeyHex"])
	sig := asString(m["signatureHex"])
	if from == "" || to == "" || !isPositiveAmount(amount) {
		return fmt.Errorf("invalid transfer fields")
	}
	pubBytes, err := fromHex(pub)
	if err != nil {
		return fmt.Errorf("invalid public key")
	}
	if AccountIDFromPublicKey(pubBytes) != from {
		return fmt.Errorf("signer_mismatch")
	}
	var body map[string]any
	if receipt {
		if asString(m["kind"]) != "offline_receipt" {
			return fmt.Errorf("invalid_receipt")
		}
		before := asString(m["balanceBefore"])
		after := asString(m["balanceAfter"])
		got, err := subAmount(before, amount)
		if err != nil {
			return err
		}
		if got != after {
			return fmt.Errorf("balance_mismatch")
		}
		body = receiptSigningBody(m)
	} else {
		body = transferSigningBody(m)
	}
	msg, err := CanonicalJSON(body)
	if err != nil {
		return err
	}
	return verifyEd25519(pub, msg, sig)
}

func commitTransfer(st State, txID string, m map[string]any) (*SubmitResult, error) {
	from := asString(m["from"])
	to := asString(m["to"])
	amount := asString(m["amount"])
	tokenID := asString(m["tokenId"])
	nonce := asString(m["nonce"])
	ts := asInt64(m["timestamp"])

	seen, err := st.Get(nonceKey(from, nonce))
	if err != nil {
		return nil, err
	}
	if len(seen) > 0 {
		return &SubmitResult{Status: "rejected", Reason: "replay_nonce"}, nil
	}

	fromBal, err := getBalanceAmount(st, from, tokenID)
	if err != nil {
		return nil, err
	}
	nextFrom, err := subAmount(fromBal, amount)
	if err != nil {
		return &SubmitResult{Status: "rejected", Reason: err.Error()}, nil
	}
	toBal, err := getBalanceAmount(st, to, tokenID)
	if err != nil {
		return nil, err
	}
	nextTo, err := addAmount(toBal, amount)
	if err != nil {
		return nil, err
	}

	if err := putBalance(st, from, tokenID, nextFrom); err != nil {
		return nil, err
	}
	if err := putBalance(st, to, tokenID, nextTo); err != nil {
		return nil, err
	}
	if err := st.Put(nonceKey(from, nonce), []byte(txID)); err != nil {
		return nil, err
	}

	rec := TxRecord{
		TxID:               txID,
		From:               from,
		To:                 to,
		Amount:             amount,
		TokenID:            tokenID,
		Timestamp:          ts,
		Nonce:              nonce,
		Particulars:        asString(m["particulars"]),
		ChequeOrRefNo:      asString(m["chequeOrRefNo"]),
		Initials:           asString(m["initials"]),
		BalanceBefore:      asString(m["balanceBefore"]),
		BalanceAfter:       asString(m["balanceAfter"]),
		GeoSource:          asString(m["geoSource"]),
		GeoCommitment:      asString(m["geoCommitment"]),
	}
	if ac, ok := m["addressCommitments"].(map[string]any); ok {
		rec.AddressCommitments = make(map[string]string, len(ac))
		for k, v := range ac {
			rec.AddressCommitments[k] = asString(v)
		}
	}
	raw, err := json.Marshal(rec)
	if err != nil {
		return nil, err
	}
	tsPart := fmt.Sprintf("%020d", ts)
	if err := st.Put(txKey(from, tsPart, txID), raw); err != nil {
		return nil, err
	}
	if from != to {
		if err := st.Put(txKey(to, tsPart, txID), raw); err != nil {
			return nil, err
		}
	}
	return &SubmitResult{TxID: txID, Status: "committed"}, nil
}

func MintTo(st State, txID, accountID, tokenID, amount string) (*SubmitResult, error) {
	if accountID == "" || (tokenID != "NIDHI-USD" && tokenID != "NIDHI-INR") {
		return nil, fmt.Errorf("invalid mint arguments")
	}
	if !isPositiveAmount(amount) {
		return nil, fmt.Errorf("mint amount must be a positive decimal string")
	}
	cur, err := getBalanceAmount(st, accountID, tokenID)
	if err != nil {
		return nil, err
	}
	next, err := addAmount(cur, amount)
	if err != nil {
		return nil, err
	}
	if err := putBalance(st, accountID, tokenID, next); err != nil {
		return nil, err
	}
	rec := TxRecord{
		TxID:      txID,
		From:      "TREASURY",
		To:        accountID,
		Amount:    amount,
		TokenID:   tokenID,
		Timestamp: 0,
		Nonce:     txID,
	}
	raw, _ := json.Marshal(rec)
	if err := st.Put(txKey(accountID, fmt.Sprintf("%020d", 0), txID), raw); err != nil {
		return nil, err
	}
	return &SubmitResult{TxID: txID, Status: "committed"}, nil
}

func SubmitSigned(st State, txID, payload string, receipt bool) (*SubmitResult, error) {
	m, err := parseJSONMap(payload)
	if err != nil {
		return &SubmitResult{Status: "rejected", Reason: "invalid_json"}, nil
	}
	if err := verifyUserTransfer(m, receipt); err != nil {
		reason := err.Error()
		if receipt && reason != "Insufficient funds" {
			if reason == "invalid_receipt" || reason == "balance_mismatch" {
				return &SubmitResult{Status: "rejected", Reason: reason}, nil
			}
		}
		return &SubmitResult{Status: "rejected", Reason: reason}, nil
	}
	return commitTransfer(st, txID, m)
}

func ReadBalance(st State, accountID, tokenID string) (*Balance, error) {
	amt, err := getBalanceAmount(st, accountID, tokenID)
	if err != nil {
		return nil, err
	}
	return &Balance{AccountID: accountID, TokenID: tokenID, Amount: amt}, nil
}

func ListTxs(st State, accountID string) ([]TxRecord, error) {
	prefix := nsTx + "\x00" + accountID + "\x00"
	raws, err := st.GetByPrefix(prefix)
	if err != nil {
		return nil, err
	}
	out := make([]TxRecord, 0, len(raws))
	seen := map[string]bool{}
	for _, raw := range raws {
		var rec TxRecord
		if err := json.Unmarshal(raw, &rec); err != nil {
			continue
		}
		if seen[rec.TxID] {
			continue
		}
		seen[rec.TxID] = true
		out = append(out, rec)
	}
	return out, nil
}
