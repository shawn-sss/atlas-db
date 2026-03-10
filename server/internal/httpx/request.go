package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

var ErrInvalidJSON = errors.New("invalid json")

func ReadJSON(r *http.Request, dst any) error {
	if r == nil || r.Body == nil {
		return ErrInvalidJSON
	}

	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		return ErrInvalidJSON
	}

	var extra any
	if err := dec.Decode(&extra); !errors.Is(err, io.EOF) {
		return ErrInvalidJSON
	}

	return nil
}
