package documents

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"atlas/internal/contentpath"
	"atlas/internal/dbutil"
	"atlas/internal/random"
)

type scannedDoc struct {
	docID     string
	slug      string
	title     string
	status    string
	owner     string
	path      string
	parent    string
	updatedAt string
	body      string
	raw       string
	links     []string
}

const (
	contentIndexMetaKey            = "content_index_last_sync"
	contentIndexFingerprintMetaKey = "content_index_fingerprint"
	contentIndexCheckInterval      = 2 * time.Second
)

var (
	contentIndexCheckMu     sync.Mutex
	lastContentIndexCheckAt time.Time
)

type sqlExecer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

func contentRoots() []struct {
	path   string
	status string
} {
	return []struct {
		path   string
		status string
	}{
		{contentpath.PublishedRoot, "published"},
		{contentpath.UnlistedRoot, "unlisted"},
	}
}

func SyncContentIndex(db *sql.DB) error {
	roots := contentRoots()

	seen := make(map[string]struct{})
	var scans []scannedDoc
	historySources := make([]creationHistorySource, 0)

	for _, root := range roots {
		if strings.TrimSpace(root.path) == "" {
			continue
		}
		_ = os.MkdirAll(root.path, 0o755)
		absRoot, err := filepath.Abs(root.path)
		if err != nil {
			return err
		}

		err = filepath.WalkDir(root.path, func(fullPath string, d os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return nil
			}
			if d.IsDir() {
				if strings.HasPrefix(d.Name(), ".") {
					return filepath.SkipDir
				}
				return nil
			}
			if !strings.HasSuffix(strings.ToLower(d.Name()), ".md") {
				return nil
			}

			absP, err := filepath.Abs(fullPath)
			if err != nil {
				return nil
			}
			if absP != absRoot && !strings.HasPrefix(absP, absRoot+string(os.PathSeparator)) {
				return nil
			}

			rel, err := filepath.Rel(absRoot, absP)
			if err != nil {
				return nil
			}
			rel = filepath.ToSlash(rel)
			slug := strings.TrimSuffix(rel, ".md")
			baseName := strings.ToLower(path.Base(rel))
			if baseName == "_index.md" {
				dir := path.Dir(rel)
				if dir != "." && dir != "" {
					conflict := filepath.Join(root.path, filepath.FromSlash(dir+".md"))
					if _, err := os.Stat(conflict); err != nil {
						slug = dir
					}
				}
			}
			if _, ok := seen[slug]; ok {
				log.Printf("sync content index: duplicate slug %s", slug)
				return nil
			}
			seen[slug] = struct{}{}

			raw, err := os.ReadFile(fullPath)
			if err != nil {
				return nil
			}
			content := string(raw)
			meta, _ := parseDocumentMetadata(content)
			if meta.ID == "" {
				meta.ID = "doc-" + random.GenerateToken(12)
				if updated, changed := ensureFrontMatterID(content, meta.ID); changed {
					if writeErr := os.WriteFile(fullPath, []byte(updated), 0o644); writeErr == nil {
						content = updated
					} else {
						log.Printf("write doc id for %s: %v", fullPath, writeErr)
						content = string(raw)
					}
				}
			}

			status := root.status
			if meta.Status != "" {
				status = meta.Status
			}
			title := extractTitle(content)
			fi, _ := os.Stat(fullPath)
			updated := time.Now().UTC()
			if fi != nil {
				updated = fi.ModTime().UTC()
			}
			body := stripFrontMatter(content)
			parent := strings.TrimSpace(parentSlug(slug))

			scans = append(scans, scannedDoc{
				docID:     meta.ID,
				slug:      slug,
				title:     title,
				status:    status,
				owner:     meta.Owner,
				path:      absP,
				parent:    parent,
				updatedAt: updated.Format(time.RFC3339),
				body:      body,
				raw:       content,
			})
			historySources = append(historySources, creationHistorySource{
				slug:  slug,
				path:  absP,
				owner: meta.Owner,
				raw:   []byte(content),
			})
			return nil
		})
		if err != nil {
			log.Printf("scan %s: %v", root.path, err)
		}
	}

	slugToDocID := make(map[string]string, len(scans))
	for _, doc := range scans {
		slugToDocID[doc.slug] = doc.docID
	}

	for i := range scans {
		scans[i].links = resolveDocLinkIDs(extractDocLinkTokens(scans[i].body), slugToDocID, scans[i].docID)
	}

	fileCount, fingerprint, err := contentFingerprintSnapshot()
	if err != nil {
		return fmt.Errorf("content fingerprint: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if len(scans) == 0 {
		if _, err := tx.Exec(`DELETE FROM documents`); err != nil {
			return fmt.Errorf("cleanup documents: %w", err)
		}
	} else {
		for _, doc := range scans {
			var parentVal sql.NullString
			if doc.parent != "" {
				parentVal = sql.NullString{String: doc.parent, Valid: true}
			}
			linkJSON := idsToJSON(doc.links)

			updatedExisting := false
			var previousSlug string
			if strings.TrimSpace(doc.docID) != "" {
				if err := tx.QueryRow(`SELECT slug FROM documents WHERE doc_id = ?`, doc.docID).Scan(&previousSlug); err != nil && err != sql.ErrNoRows {
					return fmt.Errorf("load existing slug for doc_id %s: %w", doc.docID, err)
				}
				result, err := tx.Exec(`UPDATE documents SET slug = ?, title = ?, path = ?, parent_slug = ?, status = ?, owner = ?, updated_at = ?, links = ? WHERE doc_id = ?`,
					doc.slug, doc.title, doc.path, parentVal, doc.status, doc.owner, doc.updatedAt, linkJSON, doc.docID)
				if err != nil {
					return fmt.Errorf("sync document by doc_id %s: %w", doc.docID, err)
				}
				if rowsAffected, _ := result.RowsAffected(); rowsAffected > 0 {
					updatedExisting = true
					if previousSlug != "" && previousSlug != doc.slug {
						if _, err := tx.Exec(`UPDATE history SET page_slug = ? WHERE page_slug = ?`, doc.slug, previousSlug); err != nil {
							return fmt.Errorf("sync history slug %s: %w", doc.slug, err)
						}
					}
				}
			}

			if !updatedExisting {
				if _, err := tx.Exec(`INSERT INTO documents(doc_id,slug,title,path,parent_slug,status,owner,created_at,updated_at,is_home,links)
					VALUES(?,?,?,?,?,?,?,?,?,?,?)
					ON CONFLICT(slug) DO UPDATE SET doc_id=excluded.doc_id, title=excluded.title, path=excluded.path, parent_slug=excluded.parent_slug, status=excluded.status, owner=excluded.owner, updated_at=excluded.updated_at, links=excluded.links;`,
					doc.docID, doc.slug, doc.title, doc.path, parentVal, doc.status, doc.owner, doc.updatedAt, doc.updatedAt, 0, linkJSON); err != nil {
					return fmt.Errorf("sync document %s: %w", doc.slug, err)
				}
			}

			if err := replaceDocumentsFTSByDocID(tx, doc.docID, doc.slug, doc.title, doc.raw); err != nil {
				return fmt.Errorf("sync documents_fts %s: %w", doc.slug, err)
			}
		}

		docIDs := make([]string, 0, len(scans))
		seenDocIDs := make(map[string]struct{}, len(scans))
		for _, doc := range scans {
			if _, ok := seenDocIDs[doc.docID]; ok {
				continue
			}
			seenDocIDs[doc.docID] = struct{}{}
			docIDs = append(docIDs, doc.docID)
		}
		if len(docIDs) > 0 {
			var placeholders strings.Builder
			args := make([]any, 0, len(docIDs))
			for i, docID := range docIDs {
				if i > 0 {
					placeholders.WriteString(",")
				}
				placeholders.WriteString("?")
				args = append(args, docID)
			}
			if _, err := tx.Exec(fmt.Sprintf(`DELETE FROM documents WHERE COALESCE(doc_id, '') NOT IN (%s)`, placeholders.String()), args...); err != nil {
				return fmt.Errorf("cleanup documents: %w", err)
			}
		}
	}

	if err := pruneDocumentsFTS(tx); err != nil {
		return fmt.Errorf("cleanup documents_fts: %w", err)
	}
	if err := AlignStartPageFlag(tx); err != nil {
		return fmt.Errorf("align start page flag: %w", err)
	}
	if _, err := tx.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)`, contentIndexFingerprintMetaKey, fingerprint); err != nil {
		return fmt.Errorf("write content fingerprint: %w", err)
	}
	if _, err := tx.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)`, contentIndexMetaKey, fmt.Sprintf("%d:%s", fileCount, time.Now().UTC().Format(time.RFC3339Nano))); err != nil {
		return fmt.Errorf("write content index metadata: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if err := ensureCreationHistoryEntries(db, historySources); err != nil {
		return fmt.Errorf("sync creation history: %w", err)
	}
	return nil
}

func ensureContentIndexFresh(db *sql.DB) {
	contentIndexCheckMu.Lock()
	if time.Since(lastContentIndexCheckAt) < contentIndexCheckInterval {
		contentIndexCheckMu.Unlock()
		return
	}
	lastContentIndexCheckAt = time.Now()
	contentIndexCheckMu.Unlock()

	dbCount, _ := dbutil.ScalarOrZero[int](db, `SELECT COUNT(1) FROM documents`)
	fileCount, fingerprint, err := contentFingerprintSnapshot()
	if err != nil {
		log.Printf("content fingerprint: %v", err)
		contentIndexCheckMu.Lock()
		lastContentIndexCheckAt = time.Time{}
		contentIndexCheckMu.Unlock()
		return
	}

	storedFingerprint, _ := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM meta WHERE key = ?`, contentIndexFingerprintMetaKey)
	if fileCount == dbCount && strings.TrimSpace(storedFingerprint.String) == fingerprint {
		return
	}

	if err := SyncContentIndex(db); err != nil {
		log.Printf("sync content index: %v", err)
		contentIndexCheckMu.Lock()
		lastContentIndexCheckAt = time.Time{}
		contentIndexCheckMu.Unlock()
	}
}

func StartContentIndexMonitor(ctx context.Context, db *sql.DB) {
	if ctx == nil || db == nil {
		return
	}
	go func() {
		ticker := time.NewTicker(contentIndexCheckInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				ensureContentIndexFresh(db)
			}
		}
	}()
}

func contentFingerprintSnapshot() (int, string, error) {
	var entries []string
	for _, root := range contentRoots() {
		if strings.TrimSpace(root.path) == "" {
			continue
		}
		err := filepath.WalkDir(root.path, func(fullPath string, d os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if d.IsDir() {
				if strings.HasPrefix(d.Name(), ".") {
					return filepath.SkipDir
				}
				return nil
			}
			if !strings.HasSuffix(strings.ToLower(d.Name()), ".md") {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return err
			}
			rel, err := filepath.Rel(root.path, fullPath)
			if err != nil {
				return err
			}
			entries = append(entries, fmt.Sprintf("%s:%s:%d:%d", root.status, filepath.ToSlash(rel), info.Size(), info.ModTime().UTC().UnixNano()))
			return nil
		})
		if err != nil && !os.IsNotExist(err) {
			return 0, "", err
		}
	}

	sort.Strings(entries)
	sum := sha256.New()
	for _, entry := range entries {
		_, _ = sum.Write([]byte(entry))
		_, _ = sum.Write([]byte{'\n'})
	}
	return len(entries), hex.EncodeToString(sum.Sum(nil)), nil
}

func deleteDocumentsFTSByDocID(exec sqlExecer, docID string) error {
	if strings.TrimSpace(docID) == "" {
		return nil
	}
	_, err := exec.Exec(`DELETE FROM documents_fts WHERE rowid = (SELECT id FROM documents WHERE doc_id = ?)`, docID)
	return err
}

func deleteDocumentsFTSBySlug(exec sqlExecer, slug string) error {
	if strings.TrimSpace(slug) == "" {
		return nil
	}
	_, err := exec.Exec(`DELETE FROM documents_fts WHERE rowid = (SELECT id FROM documents WHERE slug = ?)`, slug)
	return err
}

func replaceDocumentsFTSByDocID(exec sqlExecer, docID, slug, title, body string) error {
	if err := deleteDocumentsFTSByDocID(exec, docID); err != nil {
		return err
	}
	_, err := exec.Exec(`INSERT INTO documents_fts(rowid,slug,title,body) VALUES((SELECT id FROM documents WHERE doc_id = ?),?,?,?)`, docID, slug, title, body)
	return err
}

func replaceDocumentsFTSBySlug(exec sqlExecer, slug, title, body string) error {
	if err := deleteDocumentsFTSBySlug(exec, slug); err != nil {
		return err
	}
	_, err := exec.Exec(`INSERT INTO documents_fts(rowid,slug,title,body) VALUES((SELECT id FROM documents WHERE slug = ?),?,?,?)`, slug, slug, title, body)
	return err
}

func pruneDocumentsFTS(exec sqlExecer) error {
	_, err := exec.Exec(`DELETE FROM documents_fts WHERE rowid NOT IN (SELECT id FROM documents)`)
	return err
}
