package backup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"atlas/internal/contentpath"
)

func TestSaveUploadedBackupWritesSignature(t *testing.T) {
	restore := snapshotDataPaths()
	t.Cleanup(restore)

	root := t.TempDir()
	contentpath.SetDataRoot(filepath.Join(root, "data"))

	path, err := SaveUploadedBackup(strings.NewReader("backup payload"), "uploaded.zip")
	if err != nil {
		t.Fatalf("SaveUploadedBackup() error = %v", err)
	}

	if _, err := os.Stat(path + ".sig"); err != nil {
		t.Fatalf("expected signature file to exist: %v", err)
	}

	ok, err := VerifyBackup(path)
	if err != nil {
		t.Fatalf("VerifyBackup() error = %v", err)
	}
	if !ok {
		t.Fatal("VerifyBackup() = false, want true")
	}
}

func snapshotDataPaths() func() {
	dataRoot := contentpath.DataRoot
	uploadsRoot := contentpath.UploadsRoot
	historyRoot := contentpath.HistoryRoot
	backupsRoot := contentpath.BackupsRoot
	databasePath := contentpath.DatabasePath
	secretPath := contentpath.SecretPath

	return func() {
		contentpath.DataRoot = dataRoot
		contentpath.UploadsRoot = uploadsRoot
		contentpath.HistoryRoot = historyRoot
		contentpath.BackupsRoot = backupsRoot
		contentpath.DatabasePath = databasePath
		contentpath.SecretPath = secretPath
	}
}
