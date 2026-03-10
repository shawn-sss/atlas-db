package backup

import (
	"archive/zip"
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"time"

	"atlas/internal/contentpath"
)

func ensureSecret() ([]byte, error) {
	if _, err := os.Stat(contentpath.SecretPath); err == nil {
		return os.ReadFile(contentpath.SecretPath)
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	if err := contentpath.EnsureDirs(contentpath.DataRoot); err != nil {
		return nil, err
	}
	if err := os.WriteFile(contentpath.SecretPath, b, 0o600); err != nil {
		return nil, err
	}
	return b, nil
}

func CreateBackup() (string, string, error) {
	if err := contentpath.EnsureDirs(contentpath.BackupsRoot); err != nil {
		return "", "", err
	}
	ts := time.Now().Format("20060102_150405")
	name := fmt.Sprintf("backup_%s.zip", ts)
	path := filepath.Join(contentpath.BackupsRoot, name)

	f, err := os.Create(path)
	if err != nil {
		return "", "", err
	}
	zw := zip.NewWriter(f)

	addFile := func(root, rel string) error {
		p := filepath.Join(root, rel)
		info, err := os.Stat(p)
		if err != nil {
			return err
		}
		if info.IsDir() {
			return filepath.WalkDir(p, func(fp string, d fs.DirEntry, err error) error {
				if err != nil {
					return err
				}
				if d.IsDir() {
					return nil
				}
				relp, _ := filepath.Rel(root, fp)
				relp = filepath.ToSlash(relp)
				wf, err := zw.Create(relp)
				if err != nil {
					return err
				}
				rf, err := os.Open(fp)
				if err != nil {
					return err
				}
				defer rf.Close()
				_, err = io.Copy(wf, rf)
				return err
			})
		}
		wf, err := zw.Create(rel)
		if err != nil {
			return err
		}
		rf, err := os.Open(p)
		if err != nil {
			return err
		}
		defer rf.Close()
		_, err = io.Copy(wf, rf)
		return err
	}

	absContent, _ := filepath.Abs(contentpath.DocsRoot)
	contentParent := filepath.Dir(absContent)
	contentName := filepath.Base(absContent)

	if err := addFile(contentParent, contentName); err != nil {
		zw.Close()
		f.Close()
		return "", "", err
	}
	if _, err := os.Stat(contentpath.DatabasePath); err == nil {
		if err := addFile(contentpath.DataRoot, filepath.Base(contentpath.DatabasePath)); err != nil {
			zw.Close()
			f.Close()
			return "", "", err
		}
	}
	if _, err := os.Stat(contentpath.HistoryRoot); err == nil {
		if err := addFile(contentpath.DataRoot, filepath.Base(contentpath.HistoryRoot)); err != nil {
			zw.Close()
			f.Close()
			return "", "", err
		}
	}

	if err := zw.Close(); err != nil {
		f.Close()
		return "", "", err
	}
	if err := f.Close(); err != nil {
		return "", "", err
	}

	sig, err := signFile(path)
	if err != nil {
		return "", "", err
	}
	return path, sig, nil
}

func ListBackups() ([]string, error) {
	var out []string
	if err := contentpath.EnsureDirs(contentpath.BackupsRoot); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(contentpath.BackupsRoot)
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if filepath.Ext(e.Name()) == ".sig" {
			continue
		}
		out = append(out, e.Name())
	}
	return out, nil
}

func VerifyBackup(path string) (bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	sigPath := path + ".sig"
	sigb, err := os.ReadFile(sigPath)
	if err != nil {
		return false, err
	}
	secret, err := ensureSecret()
	if err != nil {
		return false, err
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write(data)
	expected := hex.EncodeToString(mac.Sum(nil))
	sigb = bytes.TrimSpace(sigb)
	return hmac.Equal([]byte(expected), sigb), nil
}

func SaveUploadedBackup(src io.Reader, filename string) (string, error) {
	if err := contentpath.EnsureDirs(contentpath.BackupsRoot); err != nil {
		return "", err
	}
	dest := filepath.Join(contentpath.BackupsRoot, filename)
	out, err := os.Create(dest)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(out, src); err != nil {
		out.Close()
		return "", err
	}
	if err := out.Close(); err != nil {
		return "", err
	}
	if _, err := signFile(dest); err != nil {
		return "", err
	}
	return dest, nil
}

func signFile(path string) (string, error) {
	secret, err := ensureSecret()
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write(data)
	sig := hex.EncodeToString(mac.Sum(nil))
	if err := os.WriteFile(path+".sig", []byte(sig), 0o600); err != nil {
		return "", err
	}
	return sig, nil
}
