package httpx

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadJSON(t *testing.T) {
	t.Run("decodes single JSON payload", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"atlas"}`))
		var payload struct {
			Name string `json:"name"`
		}

		err := ReadJSON(req, &payload)
		if err != nil {
			t.Fatalf("ReadJSON() error = %v", err)
		}
		if payload.Name != "atlas" {
			t.Fatalf("payload.Name = %q, want %q", payload.Name, "atlas")
		}
	})

	t.Run("rejects extra JSON values", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"atlas"}{"extra":true}`))
		var payload map[string]any

		err := ReadJSON(req, &payload)
		if !errors.Is(err, ErrInvalidJSON) {
			t.Fatalf("ReadJSON() error = %v, want %v", err, ErrInvalidJSON)
		}
	})

	t.Run("rejects empty body", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/", strings.NewReader(""))
		var payload map[string]any

		err := ReadJSON(req, &payload)
		if !errors.Is(err, ErrInvalidJSON) {
			t.Fatalf("ReadJSON() error = %v, want %v", err, ErrInvalidJSON)
		}
	})
}
