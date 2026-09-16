package main

import (
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"testing"
)

func TestAccountIDMatchesTypeScriptSeed01(t *testing.T) {
	seed := bytes32(1)
	priv := ed25519.NewKeyFromSeed(seed)
	pub := priv.Public().(ed25519.PublicKey)
	got := AccountIDFromPublicKey(pub)
	if got != "K2WMKX7U" {
		t.Fatalf("account id %s want K2WMKX7U pubkey %x", got, pub)
	}
}

func TestAccountIDMatchesAlphabetLength(t *testing.T) {
	pub := make([]byte, ed25519.PublicKeySize)
	id := AccountIDFromPublicKey(pub)
	if len(id) != 8 {
		t.Fatalf("account id length %d", len(id))
	}
}

func TestCanonicalJSONSortsKeys(t *testing.T) {
	got, err := CanonicalJSON(map[string]any{"b": 1, "a": "x"})
	if err != nil {
		t.Fatal(err)
	}
	if got != `{"a":"x","b":1}` {
		t.Fatalf("got %s", got)
	}
}

func TestMintTransferAndReplay(t *testing.T) {
	st := newMemState()
	seed := bytes32(1)
	priv := ed25519.NewKeyFromSeed(seed)
	pub := priv.Public().(ed25519.PublicKey)
	from := AccountIDFromPublicKey(pub)
	to := "VENDOR01"

	mint, err := MintTo(st, "tx-mint", from, "NIDHI-USD", "5000")
	if err != nil || mint.Status != "committed" {
		t.Fatalf("mint: %+v %v", mint, err)
	}
	bal, _ := ReadBalance(st, from, "NIDHI-USD")
	if bal.Amount != "5000" {
		t.Fatalf("balance after mint %s", bal.Amount)
	}

	intent := map[string]any{
		"from":      from,
		"to":        to,
		"amount":    "22",
		"tokenId":   "NIDHI-USD",
		"nonce":     "aa",
		"timestamp": int64(1700000000000),
	}
	msg, err := CanonicalJSON(intent)
	if err != nil {
		t.Fatal(err)
	}
	sig := ed25519.Sign(priv, []byte(msg))
	payload := map[string]any{
		"from":          from,
		"to":            to,
		"amount":        "22",
		"tokenId":       "NIDHI-USD",
		"nonce":         "aa",
		"timestamp":     int64(1700000000000),
		"publicKeyHex":  hex.EncodeToString(pub),
		"signatureHex":  hex.EncodeToString(sig),
	}
	raw, _ := json.Marshal(payload)
	res, err := SubmitSigned(st, "tx-1", string(raw), false)
	if err != nil || res.Status != "committed" {
		t.Fatalf("transfer: %+v %v", res, err)
	}
	bal, _ = ReadBalance(st, from, "NIDHI-USD")
	if bal.Amount != "4978" {
		t.Fatalf("buyer remaining %s", bal.Amount)
	}
	vendor, _ := ReadBalance(st, to, "NIDHI-USD")
	if vendor.Amount != "22" {
		t.Fatalf("vendor %s", vendor.Amount)
	}

	replay, err := SubmitSigned(st, "tx-2", string(raw), false)
	if err != nil || replay.Status != "rejected" || replay.Reason != "replay_nonce" {
		t.Fatalf("replay: %+v %v", replay, err)
	}
}

func TestInsufficientFundsRejected(t *testing.T) {
	st := newMemState()
	seed := bytes32(2)
	priv := ed25519.NewKeyFromSeed(seed)
	pub := priv.Public().(ed25519.PublicKey)
	from := AccountIDFromPublicKey(pub)
	intent := map[string]any{
		"from": from, "to": "VENDOR01", "amount": "22", "tokenId": "NIDHI-USD",
		"nonce": "bb", "timestamp": int64(1),
	}
	msg, _ := CanonicalJSON(intent)
	sig := ed25519.Sign(priv, []byte(msg))
	payload := map[string]any{
		"from": from, "to": "VENDOR01", "amount": "22", "tokenId": "NIDHI-USD",
		"nonce": "bb", "timestamp": int64(1),
		"publicKeyHex": hex.EncodeToString(pub), "signatureHex": hex.EncodeToString(sig),
	}
	raw, _ := json.Marshal(payload)
	res, err := SubmitSigned(st, "tx-nf", string(raw), false)
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != "rejected" {
		t.Fatalf("expected rejected, got %+v", res)
	}
}

func TestSignerMismatchRejected(t *testing.T) {
	st := newMemState()
	seed := bytes32(3)
	priv := ed25519.NewKeyFromSeed(seed)
	pub := priv.Public().(ed25519.PublicKey)
	intent := map[string]any{
		"from": "NOTMINE1", "to": "VENDOR01", "amount": "1", "tokenId": "NIDHI-USD",
		"nonce": "cc", "timestamp": int64(1),
	}
	msg, _ := CanonicalJSON(intent)
	sig := ed25519.Sign(priv, []byte(msg))
	payload := map[string]any{
		"from": "NOTMINE1", "to": "VENDOR01", "amount": "1", "tokenId": "NIDHI-USD",
		"nonce": "cc", "timestamp": int64(1),
		"publicKeyHex": hex.EncodeToString(pub), "signatureHex": hex.EncodeToString(sig),
	}
	raw, _ := json.Marshal(payload)
	res, err := SubmitSigned(st, "tx-mis", string(raw), false)
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != "rejected" || res.Reason != "signer_mismatch" {
		t.Fatalf("got %+v", res)
	}
}

func bytes32(v byte) []byte {
	b := make([]byte, 32)
	for i := range b {
		b[i] = v
	}
	return b
}
