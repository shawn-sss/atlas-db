package api

import (
	"errors"
	"net/http"
)

type uploadErrorMessages struct {
	invalidFormData string
	missingUpload   string
	invalidFile     string
	serverError     string
}

func parseMultipartUploadOrRespond(w http.ResponseWriter, r *http.Request, maxBytes int64, messages uploadErrorMessages) (*multipartUpload, bool) {
	upload, err := parseMultipartUpload(w, r, maxBytes)
	switch {
	case errors.Is(err, errInvalidFormData):
		httpErr(w, http.StatusBadRequest, messages.invalidFormData)
		return nil, false
	case errors.Is(err, errMissingUpload):
		httpErr(w, http.StatusBadRequest, messages.missingUpload)
		return nil, false
	case errors.Is(err, errInvalidUploadFile):
		httpErr(w, http.StatusBadRequest, messages.invalidFile)
		return nil, false
	case err != nil:
		httpErr(w, http.StatusInternalServerError, messages.serverError)
		return nil, false
	default:
		return upload, true
	}
}
