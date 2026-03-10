package api

import (
	"bytes"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
)

const uploadSniffSize = 512

var (
	errInvalidFormData   = errors.New("invalid form data")
	errMissingUpload     = errors.New("missing file")
	errInvalidUploadFile = errors.New("invalid upload file")
)

type multipartUpload struct {
	File   multipart.File
	Header *multipart.FileHeader
	Sniff  []byte
}

func parseMultipartUpload(w http.ResponseWriter, r *http.Request, maxBytes int64) (*multipartUpload, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	if err := r.ParseMultipartForm(maxBytes); err != nil {
		return nil, errInvalidFormData
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return nil, errMissingUpload
	}
	sniff := make([]byte, uploadSniffSize)
	n, err := io.ReadFull(file, sniff)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		file.Close()
		return nil, errInvalidUploadFile
	}
	return &multipartUpload{
		File:   file,
		Header: header,
		Sniff:  sniff[:n],
	}, nil
}

func (upload *multipartUpload) Reader() io.Reader {
	if upload == nil {
		return bytes.NewReader(nil)
	}
	return io.MultiReader(bytes.NewReader(upload.Sniff), upload.File)
}
