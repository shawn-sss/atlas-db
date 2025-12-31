package documents

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"atlas/internal/auth"
	"atlas/internal/contentpath"
	"atlas/internal/httpx"
	"atlas/internal/random"

	"github.com/go-chi/chi/v5"
	diffmatchpatch "github.com/sergi/go-diff/diffmatchpatch"
)

type documentListRow struct {
	DocID        string   `json:"doc_id"`
	Slug         string   `json:"slug"`
	Title        string   `json:"title"`
	Status       string   `json:"status"`
	Owner        string   `json:"owner"`
	CreatedAt    string   `json:"created_at"`
	UpdatedAt    string   `json:"updated_at"`
	Snippet      string   `json:"snippet,omitempty"`
	ParentSlug   string   `json:"parent_slug"`
	IsStartPage  bool     `json:"is_start_page"`
	IsPinned     bool     `json:"is_pinned"`
	IsHome       bool     `json:"is_home"`
	Path         string   `json:"-"`
	IsFolder     bool     `json:"is_folder"`
	LinkedDocIDs []string `json:"linked_doc_ids,omitempty"`
}

type documentDetailResponse struct {
	DocID        string   `json:"doc_id"`
	Slug         string   `json:"slug"`
	Title        string   `json:"title"`
	Status       string   `json:"status"`
	Owner        string   `json:"owner"`
	CreatedAt    string   `json:"created_at"`
	UpdatedAt    string   `json:"updated_at"`
	ParentSlug   string   `json:"parent_slug"`
	IsStartPage  bool     `json:"is_start_page"`
	IsPinned     bool     `json:"is_pinned"`
	IsHome       bool     `json:"is_home"`
	Content      string   `json:"content"`
	IsFolder     bool     `json:"is_folder"`
	LinkedDocIDs []string `json:"linked_doc_ids,omitempty"`
}

func docErr(w http.ResponseWriter, status int, message string) {
	httpx.WriteErrorMessage(w, status, message)
}

func listDocumentsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		statuses := parseStatusParam(r.URL.Query().Get("status"))
		if len(statuses) == 0 {
			statuses = []string{"published"}
		}
		pathPrefix := cleanPrefix(r.URL.Query().Get("pathPrefix"))

		query, args := buildDocumentQuery(statuses, pathPrefix)
		rows, err := db.Query(query, args...)
		if err != nil {
			docErr(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		var out []documentListRow
		for rows.Next() {
			var row documentListRow
			var parent sql.NullString
			var path string
			var links sql.NullString
			var owner sql.NullString
			if err := rows.Scan(&row.DocID, &row.Slug, &row.Title, &row.Status, &row.CreatedAt, &row.UpdatedAt, &parent, &row.IsStartPage, &row.IsPinned, &row.IsHome, &path, &links, &owner); err != nil {
				docErr(w, http.StatusInternalServerError, "scan error")
				return
			}
			if parent.Valid {
				row.ParentSlug = parent.String
			}
			row.Path = path
			row.IsFolder = strings.EqualFold(filepath.Base(path), "_index.md")
			row.LinkedDocIDs = idsFromJSON(links.String)
			if row.Title == "" {
				row.Title = humanizeSlug(row.Slug)
			}
			row.Owner = owner.String
			out = append(out, row)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}

func navTreeHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		statuses := parseStatusParam(query.Get("status"))
		if len(statuses) == 0 {
			statuses = []string{"published", "unlisted"}
		}
		queryStr, args := buildDocumentQuery(statuses, "")

		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()

		rows, err := db.QueryContext(ctx, queryStr, args...)
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
				httpx.WriteError(w, http.StatusGatewayTimeout, "DB_TIMEOUT", "database timeout")
				return
			}
			docErr(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		var out []documentListRow
		for rows.Next() {
			var row documentListRow
			var parent sql.NullString
			var path string
			var links sql.NullString
			var owner sql.NullString
			if err := rows.Scan(&row.DocID, &row.Slug, &row.Title, &row.Status, &row.CreatedAt, &row.UpdatedAt, &parent, &row.IsStartPage, &row.IsPinned, &row.IsHome, &path, &links, &owner); err != nil {
				docErr(w, http.StatusInternalServerError, "scan error")
				return
			}
			if parent.Valid {
				row.ParentSlug = parent.String
			}
			row.Path = path
			row.IsFolder = strings.EqualFold(filepath.Base(path), "_index.md")
			row.LinkedDocIDs = idsFromJSON(links.String)
			if row.Title == "" {
				row.Title = humanizeSlug(row.Slug)
			}
			row.Owner = owner.String
			out = append(out, row)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}

func searchDocumentsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		queryText := strings.TrimSpace(r.URL.Query().Get("q"))
		if queryText == "" {
			docErr(w, http.StatusBadRequest, "missing query")
			return
		}
		limit := 50
		if l := r.URL.Query().Get("limit"); l != "" {
			if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 200 {
				limit = parsed
			}
		}
		statuses := searchStatuses(r, r.URL.Query().Get("status"))

		field := strings.TrimSpace(r.URL.Query().Get("field"))
		matchPattern := queryText
		if field != "" {

			switch field {
			case "title":
				matchPattern = fmt.Sprintf("title:%s", queryText)
			default:

				matchPattern = queryText
			}
		}

		args := []any{matchPattern}
		var filters []string
		if len(statuses) > 0 {
			filters = append(filters, fmt.Sprintf("d.status IN (%s)", placeholders(len(statuses))))
			for _, status := range statuses {
				args = append(args, status)
			}
		}
		rankExpr := "bm25(documents_fts, 0.6, 0.35, 0.1)"
		var builder strings.Builder
		builder.WriteString(`SELECT d.doc_id,d.slug,d.title,d.status,d.updated_at,d.parent_slug,d.is_start_page,d.is_pinned,d.is_home,d.path,d.links,d.owner,snippet(documents_fts,2,'<mark>','</mark>','...',64) AS snippet`)
		builder.WriteString(` FROM documents_fts f JOIN documents d ON d.id = f.rowid WHERE documents_fts MATCH ?`)
		if len(filters) > 0 {
			builder.WriteString(" AND ")
			builder.WriteString(strings.Join(filters, " AND "))
		}
		builder.WriteString(fmt.Sprintf(" ORDER BY %s ASC, d.updated_at DESC LIMIT ?", rankExpr))

		args = append(args, limit)
		rows, err := db.Query(builder.String(), args...)
		if err != nil {
			docErr(w, http.StatusInternalServerError, "search failed")
			return
		}
		defer rows.Close()

		var out []documentListRow
		for rows.Next() {
			var row documentListRow
			var parent sql.NullString
			var path string
			var links sql.NullString
			var owner sql.NullString
			var snippet sql.NullString
			if err := rows.Scan(&row.DocID, &row.Slug, &row.Title, &row.Status, &row.UpdatedAt, &parent, &row.IsStartPage, &row.IsPinned, &row.IsHome, &path, &links, &owner, &snippet); err != nil {
				docErr(w, http.StatusInternalServerError, "scan error")
				return
			}
			if parent.Valid {
				row.ParentSlug = parent.String
			}
			row.Path = path
			row.IsFolder = strings.EqualFold(filepath.Base(path), "_index.md")
			row.LinkedDocIDs = idsFromJSON(links.String)
			if row.Title == "" {
				row.Title = humanizeSlug(row.Slug)
			}
			row.Owner = owner.String
			if snippet.Valid {
				row.Snippet = sanitizeSnippet(snippet.String)
			}
			out = append(out, row)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}

func documentDetailHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := cleanSlugParam(chi.URLParam(r, "*"))
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		path, err := docPathFromSlug(slug)
		if err != nil {
			docErr(w, http.StatusBadRequest, "invalid slug")
			return
		}
		content, err := os.ReadFile(path)
		if err != nil {
			docErr(w, http.StatusNotFound, "not found")
			return
		}

		isFolder := strings.EqualFold(filepath.Base(path), "_index.md")

		var docID sql.NullString
		var title, status, parent sql.NullString
		var created sql.NullString
		var updated sql.NullString
		var isStart int
		var isPinned int
		var isHome int
		var links sql.NullString
		var owner sql.NullString
		err = db.QueryRow(`SELECT doc_id,title,status,created_at,updated_at,parent_slug,is_start_page,is_pinned,is_home,links,owner FROM documents WHERE slug = ?`, slug).Scan(&docID, &title, &status, &created, &updated, &parent, &isStart, &isPinned, &isHome, &links, &owner)
		validRow := err == nil
		if err != nil && err != sql.ErrNoRows {
			docErr(w, http.StatusInternalServerError, "query error")
			return
		}

		meta, body := parseDocumentMetadata(string(content))
		resp := documentDetailResponse{
			DocID:       strings.TrimSpace(docID.String),
			Slug:        slug,
			Title:       title.String,
			Status:      status.String,
			Owner:       owner.String,
			CreatedAt:   created.String,
			UpdatedAt:   updated.String,
			IsStartPage: isStart != 0,
			IsPinned:    isPinned != 0,
			IsHome:      isHome != 0,
			ParentSlug:  parent.String,
			Content:     body,
			IsFolder:    isFolder,
		}
		if links.Valid {
			resp.LinkedDocIDs = idsFromJSON(links.String)
		}
		if resp.DocID == "" {
			resp.DocID = meta.ID
		}
		if !validRow {
			resp.Status = meta.Status
			resp.Owner = meta.Owner
			resp.IsStartPage = false
		}
		if resp.Title == "" {
			resp.Title = extractTitle(string(content))
		}
		if resp.Status == "" {
			resp.Status = "published"
		}
		if resp.Owner == "" {
			resp.Owner = meta.Owner
		}
		if resp.UpdatedAt == "" {
			if fi, err := os.Stat(path); err == nil {
				resp.UpdatedAt = fi.ModTime().Format(time.RFC3339)
			}
		}
		if resp.CreatedAt == "" {
			resp.CreatedAt = resp.UpdatedAt
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func documentSaveHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rawSlug := chi.URLParam(r, "*")
		slug, explicitIndex := slugParamInfo(rawSlug)
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}

		targetHub := explicitIndex
		if hubParam := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("hub"))); hubParam != "" {
			switch hubParam {
			case "1", "true", "yes":
				targetHub = true
			case "0", "false", "no":
				targetHub = false
			}
		}
		plainPath, err := docPathForSlug(slug, false)
		if err != nil {
			docErr(w, http.StatusBadRequest, "invalid slug")
			return
		}
		hubPath, err := docPathForSlug(slug, true)
		if err != nil {
			docErr(w, http.StatusBadRequest, "invalid slug")
			return
		}
		targetPath := plainPath
		if targetHub {
			targetPath = hubPath
		}

		currentPath := ""
		if _, err := os.Stat(plainPath); err == nil {
			currentPath = plainPath
		} else if _, err := os.Stat(hubPath); err == nil {
			currentPath = hubPath
		}

		if currentPath == "" {
			if isReservedSlug(slug) {
				docErr(w, http.StatusBadRequest, "reserved slug")
				return
			}
		}

		if currentPath != "" && currentPath != targetPath {
			if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
				docErr(w, http.StatusInternalServerError, "write failed")
				return
			}
			if _, err := os.Stat(targetPath); err == nil {
				_ = os.Remove(targetPath)
			}
			if err := os.Rename(currentPath, targetPath); err != nil {
				docErr(w, http.StatusInternalServerError, "rename failed")
				return
			}
			if !targetHub && currentPath == hubPath {
				_ = os.Remove(filepath.Dir(currentPath))
			}
		}
		path := targetPath
		body, err := io.ReadAll(r.Body)
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "READ_DOCUMENT_FAILED", err.Error())
			return
		}
		content := string(body)
		meta, _ := parseDocumentMetadata(content)
		if meta.ID == "" {
			meta.ID = "doc-" + random.GenerateToken(12)
			if updated, changed := ensureFrontMatterID(content, meta.ID); changed {
				content = updated
			}
		}
		var metadataErr error
		content, metadataErr = ensureDocumentMetadata(content, &meta, auth.UserFromContext(r))
		if metadataErr != nil {
			httpx.WriteError(w, http.StatusBadRequest, "INVALID_METADATA", metadataErr.Error())
			return
		}
		body = []byte(content)
		os.MkdirAll(filepath.Dir(path), 0o755)

		existed := false
		if _, err := os.Stat(path); err == nil {
			existed = true
			note := "edited (anonymous)"
			if u := auth.UserFromContext(r); u != nil {
				note = fmt.Sprintf("%s edited", u.Username)
			}
			recordHistory(db, slug, note, mustReadFile(path))
		}

		if err := os.WriteFile(path, body, 0o644); err != nil {
			docErr(w, http.StatusInternalServerError, "write failed")
			return
		}

		if !existed {
			note := "created (anonymous)"
			if u := auth.UserFromContext(r); u != nil {
				note = fmt.Sprintf("%s created", u.Username)
			}
			recordHistory(db, slug, note, body)
		}

		var oldSlugVal string
		wasStartPage := false
		renToRaw := strings.TrimSpace(r.URL.Query().Get("rename_to"))
		if renToRaw != "" {
			newSlug := slugify(renToRaw)
			if newSlug == "" {
				newSlug = "untitled"
			}
			if newSlug != slug {
				if isReservedSlug(newSlug) {
					docErr(w, http.StatusBadRequest, "reserved slug")
					return
				}

				var existingDocID sql.NullString
				err := db.QueryRow(`SELECT doc_id FROM documents WHERE slug = ?`, newSlug).Scan(&existingDocID)
				if err == nil {
					if existingDocID.String == "" || existingDocID.String != meta.ID {
						docErr(w, http.StatusConflict, "slug exists")
						return
					}
				} else if err != sql.ErrNoRows {
					docErr(w, http.StatusInternalServerError, "query error")
					return
				}

				useIndexLayout := strings.EqualFold(filepath.Base(path), "_index.md")
				var newPath string
				var pErr error
				if useIndexLayout {
					newPath, pErr = docPathFromSlugWithHint(newSlug, true)
				} else {
					newPath, pErr = docPathFromSlug(newSlug)
				}
				if pErr != nil {
					docErr(w, http.StatusBadRequest, "invalid new slug")
					return
				}
				if _, statErr := os.Stat(newPath); statErr == nil {
					docErr(w, http.StatusConflict, "slug exists")
					return
				}
				var sIsStart int
				if err := db.QueryRow(`SELECT is_start_page FROM documents WHERE slug = ?`, slug).Scan(&sIsStart); err == nil && sIsStart != 0 {
					wasStartPage = true
				}

				if err := os.MkdirAll(filepath.Dir(newPath), 0o755); err != nil {
					docErr(w, http.StatusInternalServerError, "write failed")
					return
				}

				if err := os.Rename(path, newPath); err != nil {
					docErr(w, http.StatusInternalServerError, "rename failed")
					return
				}
				oldSlugVal = slug
				slug = newSlug
				path = newPath

				db.Exec(`UPDATE history SET page_slug = ? WHERE page_slug = ?`, slug, oldSlugVal)
			}
		}

		title := extractTitle(content)
		status := meta.Status
		if status == "" {
			status = "published"
		}
		parent := parentSlug(slug)
		var parentVal sql.NullString
		if parent != "" {
			parentVal = sql.NullString{String: parent, Valid: true}
		}
		now := time.Now().Format(time.RFC3339)
		createdAt := now

		homeVal := 1
		if meta.ID != "" {
			var existingHome sql.NullInt64
			if err := db.QueryRow(`SELECT is_home FROM documents WHERE doc_id = ?`, meta.ID).Scan(&existingHome); err == nil {
				if existingHome.Valid {
					homeVal = int(existingHome.Int64)
				}
			} else if err != sql.ErrNoRows {
				docErr(w, http.StatusInternalServerError, "query error")
				return
			}
		}

		linkTokens := extractDocLinkTokens(stripFrontMatter(content))
		slugMap := make(map[string]string)
		if len(linkTokens) > 0 {
			targetSet := make(map[string]struct{})
			for _, token := range linkTokens {
				if token.Slug == "" {
					continue
				}
				targetSet[token.Slug] = struct{}{}
			}
			if len(targetSet) > 0 {
				targetSlugs := make([]string, 0, len(targetSet))
				for target := range targetSet {
					targetSlugs = append(targetSlugs, target)
				}
				args := make([]any, len(targetSlugs))
				for i, target := range targetSlugs {
					args[i] = target
				}
				rows, err := db.Query(fmt.Sprintf(`SELECT slug,doc_id FROM documents WHERE slug IN (%s)`, placeholders(len(targetSlugs))), args...)
				if err == nil {
					for rows.Next() {
						var existingSlug sql.NullString
						var existingID sql.NullString
						if scanErr := rows.Scan(&existingSlug, &existingID); scanErr == nil && existingSlug.Valid {
							slugMap[existingSlug.String] = existingID.String
						}
					}
					rows.Close()
				} else {
					log.Printf("load slug map: %v", err)
				}
			}
		}
		slugMap[slug] = meta.ID
		linkIDs := resolveDocLinkIDs(linkTokens, slugMap, meta.ID)
		linkJSON := idsToJSON(linkIDs)

		var docCount int
		_ = db.QueryRow(`SELECT COUNT(1) FROM documents`).Scan(&docCount)
		isFirst := docCount == 0

		var isStart int
		if err := db.QueryRow(`SELECT is_start_page FROM documents WHERE slug = ?`, slug).Scan(&isStart); err != nil && err != sql.ErrNoRows {
			docErr(w, http.StatusInternalServerError, "query error")
			return
		}

		_, err = db.Exec(`INSERT INTO documents(doc_id,slug,title,path,parent_slug,status,owner,created_at,updated_at,is_home,links)
			VALUES(?,?,?,?,?,?,?,?,?,?,?)
			ON CONFLICT(slug) DO UPDATE SET doc_id=excluded.doc_id, title=excluded.title, path=excluded.path, parent_slug=excluded.parent_slug, status=excluded.status, owner=excluded.owner, updated_at=excluded.updated_at, links=excluded.links;`,
			meta.ID, slug, title, path, parentVal, status, meta.Owner, createdAt, now, homeVal, linkJSON)
		if err != nil {
			docErr(w, http.StatusInternalServerError, "db update failed")
			return
		}

		db.Exec(`DELETE FROM documents_fts WHERE rowid = (SELECT id FROM documents WHERE doc_id = ?)`, meta.ID)
		db.Exec(`INSERT INTO documents_fts(rowid,slug,title,body) VALUES((SELECT id FROM documents WHERE doc_id = ?),?,?,?)`, meta.ID, slug, title, string(body))

		if wasStartPage {
			_ = SetStartPageSlug(db, slug)
		}

		if u := auth.UserFromContext(r); u != nil {
			db.Exec(`INSERT INTO audit(user_id,action,target) VALUES(?,?,?)`, u.ID, "edit_document", slug)
		}
		if isFirst {
			EnsureStartPageMeta(db, slug, true)

			if slug == "start-page" {
				seededSlugs := seedDefaultStructureIfNeeded(db)

				if err := SyncContentIndex(db); err != nil {

					log.Printf("sync after seed: %v", err)
				}
				if len(seededSlugs) > 0 {
					var placeholders strings.Builder
					args := make([]any, len(seededSlugs))
					for i, s := range seededSlugs {
						if i > 0 {
							placeholders.WriteString(",")
						}
						placeholders.WriteString("?")
						args[i] = s
					}
					_, err := db.Exec(fmt.Sprintf("UPDATE documents SET is_home = 1 WHERE slug IN (%s)", placeholders.String()), args...)
					if err != nil {
						log.Printf("set seeded home flag: %v", err)
					}
				}
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"slug": slug})
	}
}

func documentDeleteHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rawSlug := chi.URLParam(r, "*")
		slug, explicitIndex := slugParamInfo(rawSlug)
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		path, err := docPathFromSlugWithHint(slug, explicitIndex)
		if err != nil {
			docErr(w, http.StatusBadRequest, "invalid slug")
			return
		}

		if _, err := os.Stat(path); err == nil {
			if err := os.Remove(path); err != nil {
				docErr(w, http.StatusInternalServerError, "delete failed")
				return
			}
		}

		db.Exec(`DELETE FROM documents_fts WHERE rowid = (SELECT id FROM documents WHERE slug = ?)`, slug)
		db.Exec(`DELETE FROM documents WHERE slug = ?`, slug)
		if u := auth.UserFromContext(r); u != nil {
			db.Exec(`INSERT INTO audit(user_id,action,target) VALUES(?,?,?)`, u.ID, "delete_document", slug)
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func moveDocumentHandler(db *sql.DB) http.HandlerFunc {
	type moveRequest struct {
		Slug   string `json:"slug"`
		Parent string `json:"parent"`
	}
	type moveRow struct {
		DocID  sql.NullString
		Slug   string
		Parent sql.NullString
		Path   string
	}

	return func(w http.ResponseWriter, r *http.Request) {
		var req moveRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			docErr(w, http.StatusBadRequest, "invalid request")
			return
		}
		slug := cleanSlugParam(req.Slug)
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		parent := cleanSlugParam(req.Parent)
		if parent != "" {
			var parentPath string
			if err := db.QueryRow(`SELECT path FROM documents WHERE slug = ?`, parent).Scan(&parentPath); err != nil {
				if err == sql.ErrNoRows {
					docErr(w, http.StatusBadRequest, "parent not found")
					return
				}
				docErr(w, http.StatusInternalServerError, "parent lookup failed")
				return
			}
			if !strings.EqualFold(filepath.Base(parentPath), "_index.md") {
				docErr(w, http.StatusBadRequest, "parent is not a folder")
				return
			}
		}

		if parent != "" && (parent == slug || strings.HasPrefix(parent+"/", slug+"/")) {
			docErr(w, http.StatusBadRequest, "invalid parent")
			return
		}

		base := path.Base(slug)
		if base == "" || base == "." || base == "/" {
			docErr(w, http.StatusBadRequest, "invalid slug")
			return
		}
		targetSlug := base
		if parent != "" {
			targetSlug = parent + "/" + base
		}
		if isReservedSlug(targetSlug) {
			docErr(w, http.StatusBadRequest, "reserved slug")
			return
		}
		if targetSlug == slug {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"slug": slug})
			return
		}

		var rows []*moveRow
		rawRows, err := db.Query(`SELECT doc_id, slug, parent_slug, path FROM documents WHERE slug = ? OR slug LIKE ?`, slug, slug+"/%")
		if err != nil {
			docErr(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rawRows.Close()
		for rawRows.Next() {
			var row moveRow
			if err := rawRows.Scan(&row.DocID, &row.Slug, &row.Parent, &row.Path); err != nil {
				docErr(w, http.StatusInternalServerError, "query failed")
				return
			}
			rows = append(rows, &row)
		}
		if rawRows.Err() != nil {
			docErr(w, http.StatusInternalServerError, "query failed")
			return
		}
		if len(rows) == 0 {
			docErr(w, http.StatusNotFound, "document not found")
			return
		}

		var root *moveRow
		for _, row := range rows {
			if row.Slug == slug {
				root = row
				break
			}
		}
		if root == nil {
			docErr(w, http.StatusNotFound, "document not found")
			return
		}

		var conflict string
		if err := db.QueryRow(`SELECT slug FROM documents WHERE slug = ? AND slug != ?`, targetSlug, slug).Scan(&conflict); err == nil {
			docErr(w, http.StatusConflict, "slug already exists")
			return
		} else if err != sql.ErrNoRows {
			docErr(w, http.StatusInternalServerError, "slug conflict check failed")
			return
		}

		isFolder := strings.EqualFold(filepath.Base(root.Path), "_index.md")
		var renameRollback func()
		var renameDone bool
		var oldBaseDir, newBaseDir string
		var newFilePath string
		replaceSlug := func(value string) string {
			if value == "" {
				return ""
			}
			if value == slug {
				return targetSlug
			}
			if strings.HasPrefix(value, slug+"/") {
				return targetSlug + value[len(slug):]
			}
			return value
		}

		if isFolder {
			oldDir := filepath.Dir(root.Path)
			newIndexPath, err := docIndexPathFromSlug(targetSlug)
			if err != nil {
				docErr(w, http.StatusBadRequest, "invalid target")
				return
			}
			newDir := filepath.Dir(newIndexPath)
			if _, err := os.Stat(newDir); err == nil {
				docErr(w, http.StatusConflict, "target already exists")
				return
			} else if !os.IsNotExist(err) {
				docErr(w, http.StatusInternalServerError, "target path check failed")
				return
			}
			if err := os.MkdirAll(filepath.Dir(newDir), 0o755); err != nil {
				docErr(w, http.StatusInternalServerError, "create target failed")
				return
			}
			if _, err := os.Stat(oldDir); err != nil {
				docErr(w, http.StatusNotFound, "source not found")
				return
			}
			if err := os.Rename(oldDir, newDir); err != nil {
				docErr(w, http.StatusInternalServerError, "move failed")
				return
			}
			renameDone = true
			oldBaseDir, newBaseDir = oldDir, newDir
			renameRollback = func() { _ = os.Rename(newDir, oldDir) }
		} else {
			if _, err := os.Stat(root.Path); err != nil {
				docErr(w, http.StatusNotFound, "source not found")
				return
			}
			newFilePath, err = docPathFromSlug(targetSlug)
			if err != nil {
				docErr(w, http.StatusBadRequest, "invalid target")
				return
			}
			if _, err := os.Stat(filepath.Dir(newFilePath)); err != nil {
				if !os.IsNotExist(err) {
					docErr(w, http.StatusInternalServerError, "target path check failed")
					return
				}
				if err := os.MkdirAll(filepath.Dir(newFilePath), 0o755); err != nil {
					docErr(w, http.StatusInternalServerError, "create target failed")
					return
				}
			}
			if _, err := os.Stat(newFilePath); err == nil {
				docErr(w, http.StatusConflict, "target already exists")
				return
			} else if !os.IsNotExist(err) {
				docErr(w, http.StatusInternalServerError, "target path check failed")
				return
			}
			if err := os.Rename(root.Path, newFilePath); err != nil {
				docErr(w, http.StatusInternalServerError, "move failed")
				return
			}
			renameDone = true
			oldBaseDir = filepath.Dir(root.Path)
			newBaseDir = filepath.Dir(newFilePath)
			renameRollback = func() { _ = os.Rename(newFilePath, root.Path) }
		}

		tx, err := db.Begin()
		if err != nil {
			if renameDone && renameRollback != nil {
				renameRollback()
			}
			docErr(w, http.StatusInternalServerError, "transaction failed")
			return
		}
		defer tx.Rollback()

		for _, row := range rows {
			newSlug := replaceSlug(row.Slug)
			newParent := ""
			if row.Slug == slug {
				newParent = parent
			} else if row.Parent.Valid {
				newParent = replaceSlug(row.Parent.String)
			}
			parentVal := sql.NullString{String: newParent, Valid: newParent != ""}
			newPath := row.Path
			if isFolder {
				if oldBaseDir != "" && strings.HasPrefix(row.Path, oldBaseDir) {
					newPath = strings.Replace(row.Path, oldBaseDir, newBaseDir, 1)
				}
			} else if row.Slug == slug {
				newPath = newFilePath
			}
			var res sql.Result
			if row.DocID.Valid && row.DocID.String != "" {
				res, err = tx.Exec(`UPDATE documents SET slug = ?, parent_slug = ?, path = ? WHERE doc_id = ?`, newSlug, parentVal, newPath, row.DocID.String)
			} else {
				res, err = tx.Exec(`UPDATE documents SET slug = ?, parent_slug = ?, path = ? WHERE slug = ?`, newSlug, parentVal, newPath, row.Slug)
			}
			if err != nil {
				if renameDone && renameRollback != nil {
					renameRollback()
				}
				docErr(w, http.StatusInternalServerError, "update failed")
				return
			}
			if row.DocID.Valid && row.DocID.String != "" {
				_, err = tx.Exec(`UPDATE documents_fts SET slug = ? WHERE rowid = (SELECT id FROM documents WHERE doc_id = ?)`, newSlug, row.DocID.String)
			} else {
				_, err = tx.Exec(`UPDATE documents_fts SET slug = ? WHERE slug = ?`, newSlug, row.Slug)
			}
			if err != nil {
				if renameDone && renameRollback != nil {
					renameRollback()
				}
				docErr(w, http.StatusInternalServerError, "search index update failed")
				return
			}
			if _, err = tx.Exec(`UPDATE history SET page_slug = ? WHERE page_slug = ?`, newSlug, row.Slug); err != nil {
				if renameDone && renameRollback != nil {
					renameRollback()
				}
				docErr(w, http.StatusInternalServerError, "history update failed")
				return
			}
			if res != nil {
				if n, _ := res.RowsAffected(); n == 0 {
					if renameDone && renameRollback != nil {
						renameRollback()
					}
					docErr(w, http.StatusNotFound, "document not found")
					return
				}
			}
		}

		if err := tx.Commit(); err != nil {
			if renameDone && renameRollback != nil {
				renameRollback()
			}
			docErr(w, http.StatusInternalServerError, "transaction failed")
			return
		}

		if renameDone && renameRollback != nil {
			renameRollback = nil
		}

		if u := auth.UserFromContext(r); u != nil {
			db.Exec(`INSERT INTO audit(user_id,action,target,meta) VALUES(?,?,?,?)`, u.ID, "move_document", slug, targetSlug)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"slug": targetSlug})
	}
}

func documentPinHandler(db *sql.DB, pinned bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := cleanSlugParam(chi.URLParam(r, "*"))
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		pinVal := 0
		if pinned {
			pinVal = 1
		}
		res, err := db.Exec(`UPDATE documents SET is_pinned = ? WHERE slug = ?`, pinVal, slug)
		if err != nil {
			docErr(w, http.StatusInternalServerError, "update failed")
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			docErr(w, http.StatusNotFound, "not found")
			return
		}
		if u := auth.UserFromContext(r); u != nil {
			action := "pin_document"
			if !pinned {
				action = "unpin_document"
			}
			db.Exec(`INSERT INTO audit(user_id,action,target) VALUES(?,?,?)`, u.ID, action, slug)
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func documentHomeHandler(db *sql.DB, homed bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := cleanSlugParam(chi.URLParam(r, "*"))
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		var path sql.NullString
		if err := db.QueryRow(`SELECT path FROM documents WHERE slug = ?`, slug).Scan(&path); err != nil {
			if err == sql.ErrNoRows {
				docErr(w, http.StatusNotFound, "not found")
				return
			}
			docErr(w, http.StatusInternalServerError, "query failed")
			return
		}
		homeVal := 0
		if homed {
			homeVal = 1
		}
		if path.Valid && strings.EqualFold(filepath.Base(path.String), "_index.md") {
			like := slug + "/%"
			if homed {
				if _, err := db.Exec(`UPDATE documents SET is_home = 1 WHERE slug = ? OR slug LIKE ?`, slug, like); err != nil {
					docErr(w, http.StatusInternalServerError, "update failed")
					return
				}
			} else {
				if _, err := db.Exec(`UPDATE documents SET is_home = 0 WHERE (slug = ? OR slug LIKE ?) AND is_pinned = 0 AND is_start_page = 0`, slug, like); err != nil {
					docErr(w, http.StatusInternalServerError, "update failed")
					return
				}
			}
			if u := auth.UserFromContext(r); u != nil {
				action := "add_home"
				if !homed {
					action = "remove_home"
				}
				db.Exec(`INSERT INTO audit(user_id,action,target) VALUES(?,?,?)`, u.ID, action, slug)
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		res, err := db.Exec(`UPDATE documents SET is_home = ? WHERE slug = ?`, homeVal, slug)
		if err != nil {
			docErr(w, http.StatusInternalServerError, "update failed")
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			docErr(w, http.StatusNotFound, "not found")
			return
		}
		if u := auth.UserFromContext(r); u != nil {
			action := "add_home"
			if !homed {
				action = "remove_home"
			}
			db.Exec(`INSERT INTO audit(user_id,action,target) VALUES(?,?,?)`, u.ID, action, slug)
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func documentHistoryHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := cleanSlugParam(chi.URLParam(r, "*"))
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		rows, err := db.Query(`SELECT id,page_slug,file_path,saved_at,note FROM history WHERE page_slug = ? ORDER BY saved_at DESC`, slug)
		if err != nil {
			docErr(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()
		type hrow struct {
			ID       int    `json:"id"`
			PageSlug string `json:"page_slug"`
			FilePath string `json:"file_path"`
			SavedAt  string `json:"saved_at"`
			Note     string `json:"note"`
		}
		var out []hrow
		for rows.Next() {
			var h hrow
			var filePath, savedAt, note sql.NullString
			if err := rows.Scan(&h.ID, &h.PageSlug, &filePath, &savedAt, &note); err != nil {
				docErr(w, http.StatusInternalServerError, "scan error")
				return
			}
			h.FilePath = filePath.String
			h.SavedAt = savedAt.String
			h.Note = note.String
			out = append(out, h)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}

type historyDiffSegment struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type historyDiffResponse struct {
	ID       int                  `json:"id"`
	Slug     string               `json:"slug"`
	SavedAt  string               `json:"saved_at"`
	Note     string               `json:"note"`
	Segments []historyDiffSegment `json:"segments"`
}

func documentHistoryDiffHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := cleanSlugParam(chi.URLParam(r, "*"))
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		idParam := strings.TrimSpace(r.URL.Query().Get("id"))
		if idParam == "" {
			docErr(w, http.StatusBadRequest, "missing id")
			return
		}
		id, err := strconv.Atoi(idParam)
		if err != nil || id <= 0 {
			docErr(w, http.StatusBadRequest, "invalid id")
			return
		}
		var filePath string
		var savedAt sql.NullString
		var note sql.NullString
		if err := db.QueryRow(`SELECT file_path,saved_at,note FROM history WHERE id = ? AND page_slug = ?`, id, slug).Scan(&filePath, &savedAt, &note); err != nil {
			if err == sql.ErrNoRows {
				docErr(w, http.StatusNotFound, "not found")
				return
			}
			docErr(w, http.StatusInternalServerError, "query error")
			return
		}
		historyData, err := os.ReadFile(filePath)
		if err != nil {
			docErr(w, http.StatusInternalServerError, "history read failed")
			return
		}
		var currentData []byte
		if path, pathErr := docPathFromSlug(slug); pathErr == nil {
			if cur, readErr := os.ReadFile(path); readErr == nil {
				currentData = cur
			}
		}
		dmp := diffmatchpatch.New()
		diffs := dmp.DiffMain(string(historyData), string(currentData), false)
		dmp.DiffCleanupSemantic(diffs)
		segments := make([]historyDiffSegment, 0, len(diffs))
		for _, diff := range diffs {
			t := "equal"
			switch diff.Type {
			case diffmatchpatch.DiffDelete:
				t = "delete"
			case diffmatchpatch.DiffInsert:
				t = "insert"
			}
			segments = append(segments, historyDiffSegment{Type: t, Text: diff.Text})
		}
		resp := historyDiffResponse{
			ID:       id,
			Slug:     slug,
			SavedAt:  savedAt.String,
			Note:     note.String,
			Segments: segments,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func documentRestoreHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := cleanSlugParam(chi.URLParam(r, "*"))
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		var req struct{ ID int }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == 0 {
			docErr(w, http.StatusBadRequest, "missing id")
			return
		}
		var filePath string
		if err := db.QueryRow(`SELECT file_path FROM history WHERE id = ? AND page_slug = ?`, req.ID, slug).Scan(&filePath); err != nil {
			docErr(w, http.StatusNotFound, "not found")
			return
		}
		data, err := os.ReadFile(filePath)
		if err != nil {
			docErr(w, http.StatusInternalServerError, "read failed")
			return
		}
		path, err := docPathFromSlug(slug)
		if err != nil {
			docErr(w, http.StatusBadRequest, "invalid slug")
			return
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			docErr(w, http.StatusInternalServerError, "write failed")
			return
		}
		if err := os.WriteFile(path, data, 0o644); err != nil {
			docErr(w, http.StatusInternalServerError, "write failed")
			return
		}

		meta, _ := parseDocumentMetadata(string(data))
		title := extractTitle(string(data))
		status := meta.Status
		if status == "" {
			status = "published"
		}
		owner := strings.TrimSpace(meta.Owner)
		if owner == "" {
			if u := auth.UserFromContext(r); u != nil && strings.TrimSpace(u.Username) != "" {
				owner = u.Username
			} else {
				owner = "owner"
			}
		} else {
			meta.Owner = owner
		}
		parent := parentSlug(slug)
		var parentVal sql.NullString
		if parent != "" {
			parentVal = sql.NullString{String: parent, Valid: true}
		}
		now := time.Now().Format(time.RFC3339)
		createdAt := now
		_, err = db.Exec(`INSERT INTO documents(slug,title,path,parent_slug,status,owner,created_at,updated_at,is_home)
			VALUES(?,?,?,?,?,?,?,?,?)
			ON CONFLICT(slug) DO UPDATE SET title=excluded.title, path=excluded.path, parent_slug=excluded.parent_slug, status=excluded.status, owner=excluded.owner, updated_at=excluded.updated_at;`,
			slug, title, path, parentVal, status, owner, createdAt, now, 0)
		if err != nil {
			docErr(w, http.StatusInternalServerError, "db update failed")
			return
		}
		db.Exec(`DELETE FROM documents_fts WHERE rowid = (SELECT id FROM documents WHERE slug = ?)`, slug)
		db.Exec(`INSERT INTO documents_fts(rowid,slug,title,body) VALUES((SELECT id FROM documents WHERE slug = ?),?,?,?)`, slug, slug, title, string(data))
		if u := auth.UserFromContext(r); u != nil {
			db.Exec(`INSERT INTO audit(user_id,action,target,meta) VALUES(?,?,?,?)`, u.ID, "restore_document", slug, filePath)
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func backlinksHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pathParam := chi.URLParam(r, "*")
		slug := cleanSlugParam(pathParam)
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		var docID sql.NullString
		if err := db.QueryRow(`SELECT doc_id FROM documents WHERE slug = ?`, slug).Scan(&docID); err != nil && err != sql.ErrNoRows {
			docErr(w, http.StatusInternalServerError, "query error")
			return
		}
		if docID.String == "" {
			if path, err := docPathFromSlug(slug); err == nil {
				if content, err := os.ReadFile(path); err == nil {
					meta, _ := parseDocumentMetadata(string(content))
					docID.String = meta.ID
					if docID.String != "" {
						docID.Valid = true
					}
				}
			}
		}
		if docID.String == "" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]documentListRow{})
			return
		}
		pattern := "%\"" + docID.String + "\"%"
		rows, err := db.Query(`SELECT doc_id,slug,title,status,created_at,updated_at,parent_slug,is_start_page,is_pinned,path,links FROM documents WHERE links LIKE ? AND slug != ? ORDER BY updated_at DESC`, pattern, slug)
		if err != nil {
			docErr(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()
		var out []documentListRow
		for rows.Next() {
			var row documentListRow
			var parent sql.NullString
			var path string
			var links sql.NullString
			if err := rows.Scan(&row.DocID, &row.Slug, &row.Title, &row.Status, &row.CreatedAt, &row.UpdatedAt, &parent, &row.IsStartPage, &row.IsPinned, &path, &links); err != nil {
				docErr(w, http.StatusInternalServerError, "scan error")
				return
			}
			if parent.Valid {
				row.ParentSlug = parent.String
			}
			row.Path = path
			row.IsFolder = strings.EqualFold(filepath.Base(path), "_index.md")
			row.LinkedDocIDs = idsFromJSON(links.String)
			if row.Title == "" {
				row.Title = humanizeSlug(row.Slug)
			}
			out = append(out, row)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}

func parseStatusParam(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	var out []string
	for _, part := range parts {
		if normalized := normalizeStatus(part); normalized != "" {
			out = append(out, normalized)
		}
	}
	return uniqueStrings(out)
}

func searchStatuses(r *http.Request, raw string) []string {
	allowed := map[string]struct{}{
		"published": {},
		"unlisted":  {},
	}
	statuses := parseStatusParam(raw)
	if len(statuses) == 0 {
		statuses = []string{"published"}
	}
	var result []string
	for _, status := range statuses {
		if _, ok := allowed[status]; ok {
			result = append(result, status)
		}
	}
	if len(result) == 0 {
		result = append(result, "published")
	}
	return uniqueStrings(result)
}

func cleanPrefix(raw string) string {
	prefix := strings.TrimSpace(raw)
	prefix = strings.Trim(prefix, "/")
	prefix = strings.ReplaceAll(prefix, "\\", "/")
	return prefix
}

func buildDocumentQuery(statuses []string, pathPrefix string) (string, []any) {
	parts := []string{"SELECT doc_id,slug,title,status,created_at,updated_at,parent_slug,is_start_page,is_pinned,is_home,path,links,owner FROM documents"}
	var filters []string
	var args []any
	if len(statuses) > 0 {
		filters = append(filters, fmt.Sprintf("status IN (%s)", placeholders(len(statuses))))
		for _, s := range statuses {
			args = append(args, s)
		}
	}
	if pathPrefix != "" {
		filters = append(filters, "slug LIKE ?")
		args = append(args, pathPrefix+"%")
	}
	if len(filters) > 0 {
		parts = append(parts, "WHERE "+strings.Join(filters, " AND "))
	}
	parts = append(parts, "ORDER BY slug")
	return strings.Join(parts, " "), args
}

func ensureDocumentMetadata(content string, meta *DocumentMetadata, user *auth.User) (string, error) {
	block := frontMatterRE.FindString(content)
	hasStatus := block != "" && frontMatterHasKey(block, "status")
	if meta.Status == "" {
		if hasStatus {
			return content, fmt.Errorf("Status must be published or unlisted")
		}
		meta.Status = "published"
		if updated, changed := setFrontMatterField(content, "status", meta.Status); changed {
			content = updated
			block = frontMatterRE.FindString(content)
		}
	}
	owner := strings.TrimSpace(meta.Owner)
	if owner == "" {
		owner = "owner"
		if user != nil && strings.TrimSpace(user.Username) != "" {
			owner = user.Username
		}
		meta.Owner = owner
		if updated, changed := setFrontMatterField(content, "owner", owner); changed {
			content = updated
			block = frontMatterRE.FindString(content)
		}
	} else {
		meta.Owner = owner
	}
	return content, nil
}

func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	parts := make([]string, n)
	for i := range parts {
		parts[i] = "?"
	}
	return strings.Join(parts, ",")
}

func slugParamInfo(raw string) (slug string, explicitIndex bool) {

	if decoded, err := url.PathUnescape(raw); err == nil {
		raw = decoded
	}
	slug = strings.TrimSpace(raw)
	slug = strings.TrimPrefix(slug, "/")
	slug = strings.TrimSuffix(slug, ".md")
	slug = strings.Trim(slug, "/")
	slug = strings.ReplaceAll(slug, "\\", "/")

	explicitIndex = strings.HasSuffix(slug, "/_index")
	if explicitIndex {
		slug = strings.TrimSuffix(slug, "/_index")
	}
	return slug, explicitIndex
}

func cleanSlugParam(raw string) string {
	s, _ := slugParamInfo(raw)
	return s
}

func docIndexPathFromSlug(slug string) (string, error) {
	root, err := docsRootDir()
	if err != nil {
		return "", err
	}
	cleaned, _ := slugParamInfo(slug)
	if cleaned == "" {
		return "", fmt.Errorf("missing slug")
	}
	if strings.Contains(cleaned, "..") {
		return "", fmt.Errorf("invalid slug")
	}
	rel := filepath.FromSlash(cleaned)
	indexCandidate := filepath.Join(root, rel, "_index.md")
	absDocs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	abs, err := filepath.Abs(indexCandidate)
	if err != nil {
		return "", err
	}
	if abs != absDocs && !strings.HasPrefix(abs, absDocs+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid slug")
	}
	return abs, nil
}

func docPathFromSlugWithHint(slug string, preferIndexForNew bool) (string, error) {
	root, err := docsRootDir()
	if err != nil {
		return "", err
	}
	cleaned := cleanSlugParam(slug)
	if cleaned == "" {
		return "", fmt.Errorf("missing slug")
	}
	if strings.Contains(cleaned, "..") {
		return "", fmt.Errorf("invalid slug")
	}
	rel := filepath.FromSlash(cleaned)

	fileCandidate := filepath.Join(root, rel)
	if !strings.HasSuffix(strings.ToLower(fileCandidate), ".md") {
		fileCandidate += ".md"
	}

	indexCandidate := filepath.Join(root, rel, "_index.md")

	if _, err := os.Stat(fileCandidate); err == nil {
		return absoluteDocPath(fileCandidate)
	}
	if _, err := os.Stat(indexCandidate); err == nil {
		return absoluteDocPath(indexCandidate)
	}

	if preferIndexForNew {
		return absoluteDocPath(indexCandidate)
	}
	return absoluteDocPath(fileCandidate)
}

func docPathFromSlug(slug string) (string, error) {
	return docPathFromSlugWithHint(slug, false)
}

func DocPathFromSlug(slug string) (string, error) {
	return docPathFromSlug(slug)
}
func isReservedSlug(slug string) bool {
	s := cleanSlugParam(slug)
	if s == "" {
		return false
	}
	parts := strings.Split(s, "/")
	first := strings.ToLower(parts[0])
	switch first {
	case "settings", "edit", "about", "history", "backups", "new", "editor", "welcome", "setup":
		return true
	default:
		return false
	}
}

func docPathForSlug(slug string, asHub bool) (string, error) {
	root, err := docsRootDir()
	if err != nil {
		return "", err
	}
	cleaned := cleanSlugParam(slug)
	if cleaned == "" {
		return "", fmt.Errorf("missing slug")
	}
	if strings.Contains(cleaned, "..") {
		return "", fmt.Errorf("invalid slug")
	}
	rel := filepath.FromSlash(cleaned)
	var candidate string
	if asHub {
		candidate = filepath.Join(root, rel, "_index.md")
	} else {
		candidate = filepath.Join(root, rel)
		if !strings.HasSuffix(strings.ToLower(candidate), ".md") {
			candidate += ".md"
		}
	}
	return absoluteDocPath(candidate)
}

func absoluteDocPath(candidate string) (string, error) {
	root, err := docsRootDir()
	if err != nil {
		return "", err
	}
	absDocs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	absCandidate, err := filepath.Abs(candidate)
	if err != nil {
		return "", err
	}
	if absCandidate != absDocs && !strings.HasPrefix(absCandidate, absDocs+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid slug")
	}
	return absCandidate, nil
}

func docsRootDir() (string, error) {
	root := contentpath.DocsRoot
	if root == "" {
		if contentpath.ContentRoot == "" {
			return "", fmt.Errorf("docs root not configured")
		}
		root = filepath.Join(contentpath.ContentRoot, "docs")
	}
	return root, nil
}

func mustReadFile(path string) []byte {
	b, _ := os.ReadFile(path)
	return b
}

func extractTitle(md string) string {
	body := stripFrontMatter(md)
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			return strings.TrimPrefix(line, "# ")
		}
	}
	s := strings.TrimSpace(body)
	if len(s) > 60 {
		return s[:60]
	}
	return s
}

func recordHistory(db *sql.DB, slug, note string, data []byte) {
	dst, err := historyFilePath(slug)
	if err != nil {
		log.Printf("history path: %v", err)
		return
	}
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		log.Printf("history write: %v", err)
		return
	}
	if _, err := db.Exec(`INSERT INTO history(page_slug,file_path,note) VALUES(?,?,?)`, slug, dst, note); err != nil {
		log.Printf("history insert: %v", err)
	}
}

func historyFilePath(slug string) (string, error) {
	ts := time.Now().UTC().Format("20060102_150405.000000000")
	base := filepath.Join("./data/history", ts)
	if err := os.MkdirAll(base, 0o755); err != nil {
		return "", err
	}
	clean := strings.TrimSpace(slug)
	clean = strings.TrimPrefix(clean, "/")
	clean = strings.ReplaceAll(clean, "..", "_")
	clean = strings.ReplaceAll(clean, "/", "_")
	clean = strings.ReplaceAll(clean, "\\", "_")
	if clean == "" {
		clean = "entry"
	}
	name := clean
	if !strings.HasSuffix(strings.ToLower(name), ".md") {
		name += ".md"
	}
	path := filepath.Join(base, name)
	absBase, _ := filepath.Abs(base)
	absPath, _ := filepath.Abs(path)
	if absPath != absBase && !strings.HasPrefix(absPath, absBase+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid history path")
	}
	return path, nil
}

func sanitizeSnippet(raw string) string {
	if raw == "" {
		return ""
	}
	escaped := html.EscapeString(raw)
	escaped = strings.ReplaceAll(escaped, "&lt;mark&gt;", "<mark>")
	escaped = strings.ReplaceAll(escaped, "&lt;/mark&gt;", "</mark>")
	return escaped
}

func humanizeSlug(slug string) string {
	if slug == "" {
		return "Home"
	}
	parts := strings.Split(slug, "/")
	last := parts[len(parts)-1]
	if last == "" && len(parts) > 1 {
		last = parts[len(parts)-2]
	}
	return strings.ReplaceAll(last, "-", " ")
}

var slugRe = regexp.MustCompile(`[^a-z0-9/_\-]+`)

func slugify(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, "\\", "/")
	s = strings.ReplaceAll(s, " ", "-")
	s = slugRe.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "--", "-")
	s = strings.Trim(s, "-/")
	if s == "" {
		return "untitled"
	}
	return s
}
