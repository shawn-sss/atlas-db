package restore

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"atlas/internal/contentpath"
)

func FinalizeRestore(stageDir string) error {
	if stageDir == "" {
		return nil
	}
	stageDir = filepath.Clean(stageDir)
	if _, err := os.Stat(stageDir); err != nil {
		return fmt.Errorf("staging dir missing: %w", err)
	}

	ts := time.Now().Format("20060102T150405")

	
	stagedDocs := filepath.Join(stageDir, "docs")
	if info, err := os.Stat(stagedDocs); err == nil && info.IsDir() {
		current := contentpath.DocsRoot
		backup := current + ".old." + ts
		if _, err := os.Stat(current); err == nil {
			if err := os.Rename(current, backup); err != nil {
				return fmt.Errorf("move current docs aside: %w", err)
			}
		}
		if err := os.Rename(stagedDocs, current); err != nil {
			_ = os.Rename(backup, current)
			return fmt.Errorf("promote staged docs: %w", err)
		}
		_ = os.RemoveAll(backup)
	}

	
	stagedContent := filepath.Join(stageDir, "content")
	if info, err := os.Stat(stagedContent); err == nil && info.IsDir() {
		
		oldDocs := filepath.Join(stagedContent, "docs")
		if _, err := os.Stat(oldDocs); err == nil {
			if err := os.MkdirAll(contentpath.PublishedRoot, 0o755); err != nil {
				return fmt.Errorf("create published folder: %w", err)
			}
			
			filepath.WalkDir(oldDocs, func(path string, d os.DirEntry, err error) error {
				if err != nil || d.IsDir() {
					return nil
				}
				rel, err := filepath.Rel(oldDocs, path)
				if err != nil {
					return nil
				}
				dst := filepath.Join(contentpath.PublishedRoot, rel)
				os.MkdirAll(filepath.Dir(dst), 0o755)
				data, _ := os.ReadFile(path)
				os.WriteFile(dst, data, 0o644)
				return nil
			})
		}
	}

	dbDst := filepath.Join(".", "data", "app.db")
	stagedDB := filepath.Join(stageDir, "app.db")
	if _, err := os.Stat(stagedDB); err == nil {
		if _, err := os.Stat(dbDst); err == nil {
			dbBackup := dbDst + ".old." + ts
			if err := os.Rename(dbDst, dbBackup); err != nil {
				return fmt.Errorf("move current db aside: %w", err)
			}
			if err := os.Rename(stagedDB, dbDst); err != nil {

				_ = os.Rename(dbBackup, dbDst)
				return fmt.Errorf("promote staged db: %w", err)
			}
			_ = os.Remove(dbBackup)
		} else {
			if err := os.Rename(stagedDB, dbDst); err != nil {
				return fmt.Errorf("move staged db into place: %w", err)
			}
		}
	}

	stagedHistory := filepath.Join(stageDir, "history")
	if _, err := os.Stat(stagedHistory); err == nil {
		dst := filepath.Join(".", "data", "history")
		backup := dst + ".old." + ts
		if _, err := os.Stat(dst); err == nil {
			if err := os.Rename(dst, backup); err != nil {
				return fmt.Errorf("move current history aside: %w", err)
			}
		}
		if err := os.Rename(stagedHistory, dst); err != nil {
			_ = os.Rename(backup, dst)
			return fmt.Errorf("promote staged history: %w", err)
		}
		_ = os.RemoveAll(backup)
	}

	_ = os.RemoveAll(stageDir)
	return nil
}
