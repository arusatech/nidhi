package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"
)

const accountAlphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"

func fromHex(s string) ([]byte, error) {
	s = strings.TrimPrefix(strings.ToLower(s), "0x")
	return hex.DecodeString(s)
}

// AccountIDFromPublicKey matches TypeScript accountIdFromPublicKey (8-char Crockford-ish).
func AccountIDFromPublicKey(publicKey []byte) string {
	sum := sha256.Sum256(publicKey)
	n := new(big.Int)
	for i := 0; i < 8; i++ {
		n.Lsh(n, 8)
		n.Or(n, big.NewInt(int64(sum[i])))
	}
	div := big.NewInt(32)
	out := make([]byte, 8)
	for i := 0; i < 8; i++ {
		quo := new(big.Int)
		rem := new(big.Int)
		quo.DivMod(n, div, rem)
		out[7-i] = accountAlphabet[rem.Int64()]
		n = quo
	}
	return string(out)
}

func verifyEd25519(publicKeyHex, message, signatureHex string) error {
	pub, err := fromHex(publicKeyHex)
	if err != nil || len(pub) != ed25519.PublicKeySize {
		return fmt.Errorf("invalid public key")
	}
	sig, err := fromHex(signatureHex)
	if err != nil || len(sig) != ed25519.SignatureSize {
		return fmt.Errorf("invalid signature")
	}
	if !ed25519.Verify(ed25519.PublicKey(pub), []byte(message), sig) {
		return fmt.Errorf("invalid_signature")
	}
	return nil
}
