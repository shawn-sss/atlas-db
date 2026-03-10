package httpx

import (
	"encoding/json"
	"net/http"
	"strings"
	"unicode"
)

func WriteJSON(w http.ResponseWriter, status int, payload any) {
	if payload == nil {
		WriteRawJSON(w, status, nil)
		return
	}

	data, err := json.Marshal(payload)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "JSON_ENCODE_FAILED", "json encode failed")
		return
	}
	WriteRawJSON(w, status, append(data, '\n'))
}

func WriteRawJSON(w http.ResponseWriter, status int, payload []byte) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if status == http.StatusNoContent || len(payload) == 0 {
		return
	}
	_, _ = w.Write(payload)
}

func WriteError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
}

func WriteErrorMessage(w http.ResponseWriter, status int, message string) {
	WriteError(w, status, deriveErrorCode(message), message)
}

func deriveErrorCode(message string) string {
	if message == "" {
		return "ERROR"
	}
	var b strings.Builder
	upper := strings.ToUpper(message)
	prevUnderscore := false
	for _, r := range upper {
		switch {
		case unicode.IsLetter(r), unicode.IsDigit(r):
			b.WriteRune(r)
			prevUnderscore = false
		case r == ' ' || r == '-' || r == '_' || r == '.' || r == '/':
			if !prevUnderscore {
				b.WriteRune('_')
				prevUnderscore = true
			}
		default:
			if !prevUnderscore {
				b.WriteRune('_')
				prevUnderscore = true
			}
		}
	}
	code := strings.Trim(b.String(), "_")
	if code == "" {
		return "ERROR"
	}
	return code
}
