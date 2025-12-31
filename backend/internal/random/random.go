package random

import (
	"crypto/rand"
	"encoding/hex"
)

func GenerateToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
