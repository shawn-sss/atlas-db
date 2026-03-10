package contentpath

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var (
	DocsRoot      string
	PublishedRoot string
	UnlistedRoot  string
	DraftsRoot    string

	DataRoot     string
	UploadsRoot  string
	HistoryRoot  string
	BackupsRoot  string
	DatabasePath string
	SecretPath   string
)

func init() {
	SetRoots("docs")
	SetDataRoot("./data")
}

func SetRoots(docsPath string) {
	DocsRoot = filepath.Clean(docsPath)
	PublishedRoot = filepath.Join(DocsRoot, "published")
	UnlistedRoot = filepath.Join(DocsRoot, "unlisted")
	DraftsRoot = filepath.Join(DocsRoot, "drafts")
}

func SetDataRoot(dataPath string) {
	DataRoot = filepath.Clean(dataPath)
	UploadsRoot = filepath.Join(DataRoot, "uploads")
	HistoryRoot = filepath.Join(DataRoot, "history")
	BackupsRoot = filepath.Join(DataRoot, "backups")
	DatabasePath = filepath.Join(DataRoot, "app.db")
	SecretPath = filepath.Join(DataRoot, "secret.key")
}

func EnsureDirs(paths ...string) error {
	for _, path := range paths {
		if strings.TrimSpace(path) == "" {
			continue
		}
		if err := os.MkdirAll(path, 0o755); err != nil {
			return err
		}
	}
	return nil
}

func EnsureDocsDirs() error {
	return EnsureDirs(DocsRoot, PublishedRoot, UnlistedRoot, DraftsRoot)
}

func EnsureDataDirs() error {
	return EnsureDirs(DataRoot, UploadsRoot, HistoryRoot, BackupsRoot)
}

func EnsureRuntimeDirs() error {
	if err := EnsureDocsDirs(); err != nil {
		return err
	}
	return EnsureDataDirs()
}

func ResolveWithinBase(base, name string) (string, error) {
	if strings.TrimSpace(base) == "" {
		return "", fmt.Errorf("base path is required")
	}
	base = filepath.Clean(base)
	target := base
	if strings.TrimSpace(name) != "" {
		target = filepath.Join(base, filepath.Clean(name))
	}
	baseAbs, err := filepath.Abs(base)
	if err != nil {
		return "", err
	}
	targetAbs, err := filepath.Abs(target)
	if err != nil {
		return "", err
	}
	if targetAbs != baseAbs && !strings.HasPrefix(targetAbs, baseAbs+string(os.PathSeparator)) {
		return "", fmt.Errorf("path escapes base")
	}
	return target, nil
}

func GetRootForStatus(status string) string {
	switch status {
	case "unlisted":
		return UnlistedRoot
	default:
		return PublishedRoot
	}
}
