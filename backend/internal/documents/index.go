package documents

import (
	"database/sql"
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

func SyncContentIndex(db *sql.DB) error {
	root := contentpath.DocsRoot
	if root == "" {
		root = filepath.Join(contentpath.ContentRoot, "docs")
	}
	_ = os.MkdirAll(root, 0o755)
	absRoot, _ := filepath.Abs(root)
	seen := make(map[string]struct{})
	var scans []scannedDoc

	err := filepath.WalkDir(root, func(fullPath string, d os.DirEntry, err error) error {
		if err != nil {
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

		absP, _ := filepath.Abs(fullPath)
		if absP != absRoot && !strings.HasPrefix(absP, absRoot+string(os.PathSeparator)) {
			return nil
		}

		rel, err := filepath.Rel(root, fullPath)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		slug := strings.TrimSuffix(rel, ".md")
		baseName := strings.ToLower(path.Base(rel))
		if baseName == "_index.md" {
			dir := path.Dir(rel)
			if dir != "." && dir != "" {
				conflict := filepath.Join(root, filepath.FromSlash(dir+".md"))
				if _, err := os.Stat(conflict); err != nil {
					slug = dir
				}
			}
		}
		if _, ok := seen[slug]; ok {
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
		if meta.Status == "" {
			meta.Status = "published"
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
			status:    meta.Status,
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
		return err
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
		_, err := db.Exec(`INSERT INTO documents(doc_id,slug,title,path,parent_slug,status,owner,created_at,updated_at,is_home,links)
			VALUES(?,?,?,?,?,?,?,?,?,?,?)
			ON CONFLICT(slug) DO UPDATE SET doc_id=excluded.doc_id, path=excluded.path, parent_slug=excluded.parent_slug, status=excluded.status, owner=excluded.owner, updated_at=excluded.updated_at, links=excluded.links;`,
			doc.docID, doc.slug, doc.title, doc.path, parentVal, doc.status, doc.owner, doc.updatedAt, doc.updatedAt, 0, idsToJSON(doc.links))
		if err != nil {
			log.Printf("sync document %s: %v", doc.slug, err)
			continue
		}
		db.Exec(`DELETE FROM documents_fts WHERE rowid = (SELECT id FROM documents WHERE doc_id = ?)`, doc.docID)
		db.Exec(`INSERT INTO documents_fts(rowid,slug,title,body) VALUES((SELECT id FROM documents WHERE doc_id = ?),?,?,?)`, doc.docID, doc.slug, doc.title, doc.raw)
	}

	if err := AlignStartPageFlag(db); err != nil {
		log.Printf("align start page flag: %v", err)
	}
	return nil
}
