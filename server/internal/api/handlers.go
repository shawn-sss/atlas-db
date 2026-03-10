package api

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"errors"
	"image"
	stddraw "image/draw"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"atlas/internal/documents"
	"atlas/internal/httpx"
	"atlas/internal/random"

	"github.com/go-chi/chi/v5"
	_ "golang.org/x/image/bmp"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

func httpErr(w http.ResponseWriter, status int, message string) {
	httpx.WriteErrorMessage(w, status, message)
}

func RegisterRoutes(r chi.Router, db *sql.DB, restoreCh chan<- string) {
	registerBootstrapRoutes(r, db)
	registerAuthRoutes(r, db)
	registerPreferenceRoutes(r, db)
	registerBackupRoutes(r, db, restoreCh)
	documents.RegisterRoutes(r, db)
}

func detectImageType(header []byte) (ext string, mime string, ok bool) {

	if len(header) >= 8 && bytes.Equal(header[:8], []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}) {
		return ".png", "image/png", true
	}

	if len(header) >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF {
		return ".jpg", "image/jpeg", true
	}

	if len(header) >= 6 && (bytes.HasPrefix(header, []byte("GIF87a")) || bytes.HasPrefix(header, []byte("GIF89a"))) {
		return ".gif", "image/gif", true
	}

	if len(header) >= 12 && bytes.HasPrefix(header, []byte("RIFF")) && bytes.Equal(header[8:12], []byte("WEBP")) {
		return ".webp", "image/webp", true
	}

	if len(header) >= 2 && header[0] == 0x42 && header[1] == 0x4D {
		return ".bmp", "image/bmp", true
	}
	return "", "", false
}

var errUnsupportedImageType = errors.New("unsupported image type")

func storeUploadedImage(src io.Reader, sniff []byte) (string, string, error) {
	ext, mimeType, ok := detectImageType(sniff)
	if !ok {
		return "", "", errUnsupportedImageType
	}
	uploadsDir := filepath.Clean("./data/uploads")
	if err := os.MkdirAll(uploadsDir, 0o755); err != nil {
		return "", "", err
	}
	fname := random.GenerateToken(12)
	outPath := filepath.Join(uploadsDir, fname+ext)
	out, err := os.Create(outPath)
	if err != nil {
		return "", "", err
	}
	defer out.Close()
	if len(sniff) > 0 {
		if _, err := out.Write(sniff); err != nil {
			return "", "", err
		}
	}
	if _, err := io.Copy(out, src); err != nil {
		return "", "", err
	}
	return "/uploads/" + fname + ext, mimeType, nil
}

func storeUploadedIcon(src io.Reader, sniff []byte) (string, string, error) {
	if _, _, ok := detectImageType(sniff); !ok {
		return "", "", errUnsupportedImageType
	}

	reader := io.MultiReader(bytes.NewReader(sniff), src)
	img, _, err := image.Decode(reader)
	if err != nil {
		return "", "", err
	}
	cropped := cropToSquare(img)
	if cropped.Bounds().Dx() <= 0 || cropped.Bounds().Dy() <= 0 {
		return "", "", errors.New("invalid image dimensions")
	}

	const iconSize = 512
	dst := image.NewRGBA(image.Rect(0, 0, iconSize, iconSize))
	draw.CatmullRom.Scale(dst, dst.Bounds(), cropped, cropped.Bounds(), draw.Over, nil)

	uploadsDir := filepath.Clean("./data/uploads")
	if err := os.MkdirAll(uploadsDir, 0o755); err != nil {
		return "", "", err
	}
	fname := random.GenerateToken(12)
	outPath := filepath.Join(uploadsDir, fname+".png")
	out, err := os.Create(outPath)
	if err != nil {
		return "", "", err
	}
	defer out.Close()
	if err := png.Encode(out, dst); err != nil {
		return "", "", err
	}
	return "/uploads/" + fname + ".png", "image/png", nil
}

func cropToSquare(img image.Image) image.Image {
	b := img.Bounds()
	width := b.Dx()
	height := b.Dy()
	if width <= 0 || height <= 0 {
		return img
	}
	size := width
	if height < size {
		size = height
	}
	x0 := b.Min.X + (width-size)/2
	y0 := b.Min.Y + (height-size)/2
	rect := image.Rect(x0, y0, x0+size, y0+size)

	if sub, ok := img.(interface{ SubImage(r image.Rectangle) image.Image }); ok {
		return sub.SubImage(rect)
	}
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	stddraw.Draw(dst, dst.Bounds(), img, rect.Min, stddraw.Src)
	return dst
}

func stageBackupZip(srcZip, dest string) error {
	zr, err := zip.OpenReader(srcZip)
	if err != nil {
		return err
	}
	defer zr.Close()

	for _, f := range zr.File {
		name := filepath.Clean(f.Name)
		if name == "" || name == "." {
			continue
		}
		if strings.HasPrefix(name, ".."+string(os.PathSeparator)) || strings.HasPrefix(name, "..") || filepath.IsAbs(name) {
			continue
		}

		destPath := filepath.Join(dest, name)
		destAbs, _ := filepath.Abs(destPath)
		baseAbs, _ := filepath.Abs(dest)
		if destAbs != baseAbs && !strings.HasPrefix(destAbs, baseAbs+string(os.PathSeparator)) {
			continue
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(destPath, 0o755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.Create(destPath)
		if err != nil {
			rc.Close()
			return err
		}
		if _, err := io.Copy(out, rc); err != nil {
			rc.Close()
			out.Close()
			return err
		}
		rc.Close()
		out.Close()
	}

	if info, err := os.Stat(filepath.Join(dest, "content")); err == nil && info.IsDir() {
		return nil
	}
	if _, err := os.Stat(filepath.Join(dest, "app.db")); err == nil {
		return nil
	}
	return errors.New("backup missing content or database")
}
