package documents

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"atlas/internal/contentpath"
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

const contentIndexMetaKey = "content_index_last_sync"

func SyncContentIndex(db *sql.DB) error {
	
	roots := []struct {
		path   string
		status string
	}{
		{contentpath.PublishedRoot, "published"},
		{contentpath.UnlistedRoot, "unlisted"},
		{contentpath.DraftsRoot, "draft"},
	}

	log.Printf("[SyncContentIndex] Starting scan. Roots: published=%s unlisted=%s drafts=%s",
		contentpath.PublishedRoot, contentpath.UnlistedRoot, contentpath.DraftsRoot)

	seen := make(map[string]struct{})
	var scans []scannedDoc

	for _, root := range roots {
		if root.path == "" {
			log.Printf("[SyncContentIndex] Skipping empty root for status: %s", root.status)
			continue
		}
		_ = os.MkdirAll(root.path, 0o755)
		absRoot, _ := filepath.Abs(root.path)
		log.Printf("[SyncContentIndex] Scanning %s (status: %s, abs: %s)", root.path, root.status, absRoot)

		err := filepath.WalkDir(root.path, func(fullPath string, d os.DirEntry, err error) error {
			if err != nil {
				log.Printf("[SyncContentIndex] WalkDir error at %s: %v", fullPath, err)
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

			log.Printf("[SyncContentIndex] Found .md file: %s", fullPath)

			absP, _ := filepath.Abs(fullPath)
			if absP != absRoot && !strings.HasPrefix(absP, absRoot+string(os.PathSeparator)) {
				log.Printf("[SyncContentIndex] Skipping file outside root: %s (root: %s)", absP, absRoot)
				return nil
			}

			log.Printf("[SyncContentIndex] Path validation passed for: %s", fullPath)

			rel, err := filepath.Rel(absRoot, absP)
			if err != nil {
				log.Printf("[SyncContentIndex] Failed to get relative path for %s: %v", fullPath, err)
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
				log.Printf("[SyncContentIndex] Duplicate slug, skipping: %s", slug)
				return nil
			}
			seen[slug] = struct{}{}

			log.Printf("[SyncContentIndex] About to read file: %s (slug: %s)", fullPath, slug)

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
			return nil
		})
		if err != nil {
			log.Printf("scan %s: %v", root.path, err)
		}
	}

	if len(scans) == 0 {
		log.Printf("[SyncContentIndex] No documents scanned, cleaning up DB")
		if _, err := db.Exec(`DELETE FROM documents`); err != nil {
			log.Printf("cleanup documents: %v", err)
		}
		if _, err := db.Exec(`DELETE FROM documents_fts`); err != nil {
			log.Printf("cleanup documents_fts: %v", err)
		}
	} else {
		log.Printf("[SyncContentIndex] Scanned %d documents, syncing to DB", len(scans))
		var placeholders strings.Builder
		args := make([]any, len(scans))
		for i, doc := range scans {
			if i > 0 {
				placeholders.WriteString(",")
			}
			placeholders.WriteString("?")
			args[i] = doc.slug
		}
		if _, err := db.Exec(fmt.Sprintf("DELETE FROM documents WHERE slug NOT IN (%s)", placeholders.String()), args...); err != nil {
			log.Printf("cleanup documents: %v", err)
		}
		if _, err := db.Exec(`DELETE FROM documents_fts WHERE rowid NOT IN (SELECT id FROM documents)`); err != nil {
			log.Printf("cleanup documents_fts: %v", err)
		}
	}

	slugToDocID := make(map[string]string, len(scans))
	for _, doc := range scans {
		slugToDocID[doc.slug] = doc.docID
	}

	for i := range scans {
		scans[i].links = resolveDocLinkIDs(extractDocLinkTokens(scans[i].body), slugToDocID, scans[i].docID)
	}

	for _, doc := range scans {
		var parentVal sql.NullString
		if doc.parent != "" {
			parentVal = sql.NullString{String: doc.parent, Valid: true}
		}
		result, err := db.Exec(`INSERT INTO documents(doc_id,slug,title,path,parent_slug,status,owner,created_at,updated_at,is_home,links)
			VALUES(?,?,?,?,?,?,?,?,?,?,?)
			ON CONFLICT(slug) DO UPDATE SET doc_id=excluded.doc_id, path=excluded.path, parent_slug=excluded.parent_slug, status=excluded.status, owner=excluded.owner, updated_at=excluded.updated_at, links=excluded.links;`,
			doc.docID, doc.slug, doc.title, doc.path, parentVal, doc.status, doc.owner, doc.updatedAt, doc.updatedAt, 0, idsToJSON(doc.links))
		if err != nil {
			log.Printf("sync document %s: %v", doc.slug, err)
			continue
		}
		rowsAffected, _ := result.RowsAffected()
		log.Printf("[SyncContentIndex] Inserted/updated document %s (rows affected: %d)", doc.slug, rowsAffected)

		db.Exec(`DELETE FROM documents_fts WHERE rowid = (SELECT id FROM documents WHERE doc_id = ?)`, doc.docID)
		db.Exec(`INSERT INTO documents_fts(rowid,slug,title,body) VALUES((SELECT id FROM documents WHERE doc_id = ?),?,?,?)`, doc.docID, doc.slug, doc.title, doc.raw)
	}

	

	if err := AlignStartPageFlag(db); err != nil {
		log.Printf("align start page flag: %v", err)
	}
	_, _ = db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)`, contentIndexMetaKey, fmt.Sprintf("%d", time.Now().Unix()))
	return nil
}



func ensureContentIndexFresh(db *sql.DB) {
	var dbCount int
	_ = db.QueryRow(`SELECT COUNT(1) FROM documents`).Scan(&dbCount)

	
	fileCount := 0
	roots := []string{
		contentpath.PublishedRoot,
		contentpath.UnlistedRoot,
		contentpath.DraftsRoot,
	}
	for _, root := range roots {
		if root == "" {
			continue
		}
		_ = filepath.WalkDir(root, func(fullPath string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			if strings.HasSuffix(strings.ToLower(d.Name()), ".md") {
				fileCount++
			}
			return nil
		})
	}

	log.Printf("[ensureContentIndexFresh] dbCount=%d fileCount=%d", dbCount, fileCount)

	
	var seeded sql.NullString
	_ = db.QueryRow(`SELECT value FROM meta WHERE key = ?`, "seed_default_content_v1").Scan(&seeded)
	hasSeeded := seeded.Valid && strings.TrimSpace(seeded.String) != ""

	log.Printf("[ensureContentIndexFresh] hasSeeded=%v", hasSeeded)

	
	if fileCount != dbCount || !hasSeeded {
		log.Printf("[ensureContentIndexFresh] triggering sync")
		if err := SyncContentIndex(db); err != nil {
			log.Printf("sync content index: %v", err)
		} else {
			log.Printf("[ensureContentIndexFresh] sync completed successfully")
		}
	} else {
		log.Printf("[ensureContentIndexFresh] no sync needed")
	}
}
