package contentpath

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEnsureRuntimeDirsCreatesExpectedFolders(t *testing.T) {
	restore := snapshotPaths()
	t.Cleanup(restore)

	root := t.TempDir()
	SetRoots(filepath.Join(root, "docs"))
	SetDataRoot(filepath.Join(root, "data"))

	if err := EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs() error = %v", err)
	}

	for _, path := range []string{
		DocsRoot,
		PublishedRoot,
		UnlistedRoot,
		DraftsRoot,
		DataRoot,
		UploadsRoot,
		HistoryRoot,
		BackupsRoot,
	} {
		if info, err := os.Stat(path); err != nil || !info.IsDir() {
			t.Fatalf("expected directory %q to exist, err=%v", path, err)
		}
	}
}

func TestResolveWithinBaseRejectsEscape(t *testing.T) {
	base := t.TempDir()

	_, err := ResolveWithinBase(base, filepath.Join("..", "outside.txt"))
	if err == nil {
		t.Fatal("ResolveWithinBase should reject escaping paths")
	}
}

func TestResolveWithinBaseAllowsNestedFile(t *testing.T) {
	base := t.TempDir()

	got, err := ResolveWithinBase(base, filepath.Join("nested", "file.txt"))
	if err != nil {
		t.Fatalf("ResolveWithinBase() error = %v", err)
	}

	want := filepath.Join(base, "nested", "file.txt")
	if got != want {
		t.Fatalf("ResolveWithinBase() = %q, want %q", got, want)
	}
}

func snapshotPaths() func() {
	docsRoot := DocsRoot
	publishedRoot := PublishedRoot
	unlistedRoot := UnlistedRoot
	draftsRoot := DraftsRoot
	dataRoot := DataRoot
	uploadsRoot := UploadsRoot
	historyRoot := HistoryRoot
	backupsRoot := BackupsRoot
	databasePath := DatabasePath
	secretPath := SecretPath

	return func() {
		DocsRoot = docsRoot
		PublishedRoot = publishedRoot
		UnlistedRoot = unlistedRoot
		DraftsRoot = draftsRoot
		DataRoot = dataRoot
		UploadsRoot = uploadsRoot
		HistoryRoot = historyRoot
		BackupsRoot = backupsRoot
		DatabasePath = databasePath
		SecretPath = secretPath
	}
}
