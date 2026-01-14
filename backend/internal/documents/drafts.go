package documents

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"atlas/internal/auth"
	"atlas/internal/contentpath"
	"atlas/internal/httpx"

	"github.com/go-chi/chi/v5"
)

type draftNode struct {
	Slug       string `json:"slug"`
	Title      string `json:"title"`
	Status     string `json:"status"`
	ParentSlug string `json:"parent_slug"`
	UpdatedAt  string `json:"updated_at"`
	IsFolder   bool   `json:"is_folder"`
}

func draftsTreeHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := auth.UserFromContext(r)
		if u == nil {
			httpx.WriteErrorMessage(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		rows, err := db.Query(
			`SELECT slug,title,parent_slug,updated_at,is_folder FROM user_drafts WHERE user_id = ? ORDER BY slug`,
			u.ID,
		)
		if err != nil {
			httpx.WriteErrorMessage(w, http.StatusInternalServerError, "query error")
			return
		}
		defer rows.Close()

		var out []draftNode
		for rows.Next() {
			var row draftNode
			var parent sql.NullString
			var updated sql.NullString
			var isFolder int
			if err := rows.Scan(&row.Slug, &row.Title, &parent, &updated, &isFolder); err != nil {
				httpx.WriteErrorMessage(w, http.StatusInternalServerError, "scan error")
				return
			}
			if parent.Valid {
				row.ParentSlug = parent.String
			}
			row.IsFolder = isFolder != 0
			row.UpdatedAt = updated.String
			row.Status = "draft"
			if row.Title == "" {
				row.Title = humanizeSlug(row.Slug)
			}
			out = append(out, row)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}

func draftDetailHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := auth.UserFromContext(r)
		if u == nil {
			httpx.WriteErrorMessage(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		slug := cleanSlugParam(chi.URLParam(r, "*"))
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}

		var title sql.NullString
		var path string
		var parent sql.NullString
		var updated sql.NullString
		var isFolder int
		err := db.QueryRow(
			`SELECT title,path,parent_slug,updated_at,is_folder FROM user_drafts WHERE user_id = ? AND slug = ?`,
			u.ID,
			slug,
		).Scan(&title, &path, &parent, &updated, &isFolder)
		if err != nil {
			if err == sql.ErrNoRows {
				docErr(w, http.StatusNotFound, "not found")
				return
			}
			docErr(w, http.StatusInternalServerError, "query error")
			return
		}

		content, err := os.ReadFile(path)
		if err != nil {
			docErr(w, http.StatusNotFound, "not found")
			return
		}
		meta, body := parseDocumentMetadata(string(content))
		resp := documentDetailResponse{
			Slug:       slug,
			Title:      strings.TrimSpace(title.String),
			Status:     "draft",
			Owner:      u.Username,
			UpdatedAt:  updated.String,
			ParentSlug: parent.String,
			Content:    body,
			IsFolder:   isFolder != 0,
		}
		if resp.Title == "" {
			resp.Title = extractTitle(string(content))
		}
		if resp.UpdatedAt == "" {
			if fi, err := os.Stat(path); err == nil {
				resp.UpdatedAt = fi.ModTime().UTC().Format(time.RFC3339)
			}
		}
		if resp.CreatedAt == "" {
			resp.CreatedAt = resp.UpdatedAt
		}
		if resp.DocID == "" {
			resp.DocID = meta.ID
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func draftSaveHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := auth.UserFromContext(r)
		if u == nil {
			httpx.WriteErrorMessage(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		rawSlug := chi.URLParam(r, "*")
		slug, explicitIndex := slugParamInfo(rawSlug)
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		renameRaw := strings.TrimSpace(r.URL.Query().Get("rename_to"))
		renameTo := ""
		renameIndex := false
		if renameRaw != "" {
			renameTo, renameIndex = slugParamInfo(renameRaw)
			if renameTo == "" {
				docErr(w, http.StatusBadRequest, "invalid new slug")
				return
			}
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "READ_DRAFT_FAILED", err.Error())
			return
		}

		targetSlug := slug
		targetIndex := explicitIndex
		if renameTo != "" {
			targetSlug = renameTo
			targetIndex = renameIndex
			if !renameIndex {
				targetIndex = explicitIndex
			}
		}

		path, isFolder, err := draftPathFromSlug(u.Username, targetSlug, targetIndex)
		if err != nil {
			docErr(w, http.StatusBadRequest, "invalid slug")
			return
		}

		if renameTo != "" && renameTo != slug {
			var exists int
			if err := db.QueryRow(
				`SELECT COUNT(1) FROM user_drafts WHERE user_id = ? AND slug = ?`,
				u.ID,
				renameTo,
			).Scan(&exists); err != nil {
				docErr(w, http.StatusInternalServerError, "query error")
				return
			}
			if exists > 0 {
				docErr(w, http.StatusConflict, "slug exists")
				return
			}
		}

		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			docErr(w, http.StatusInternalServerError, "write failed")
			return
		}
		if err := os.WriteFile(path, body, 0o644); err != nil {
			docErr(w, http.StatusInternalServerError, "write failed")
			return
		}

		if renameTo != "" && renameTo != slug {
			if oldPath, _, err := draftPathFromSlug(u.Username, slug, explicitIndex); err == nil && oldPath != path {
				_ = os.Remove(oldPath)
				cleanupDraftDirs(oldPath, u.Username)
			}
			db.Exec(`DELETE FROM user_drafts WHERE user_id = ? AND slug = ?`, u.ID, slug)
		}

		now := time.Now().UTC().Format(time.RFC3339)
		title := extractTitle(string(body))
		parent := parentSlug(targetSlug)
		var parentVal sql.NullString
		if parent != "" {
			parentVal = sql.NullString{String: parent, Valid: true}
		}
		if _, err := db.Exec(
			`INSERT INTO user_drafts(user_id,slug,title,path,parent_slug,updated_at,is_folder)
			 VALUES(?,?,?,?,?,?,?)
			 ON CONFLICT(user_id, slug) DO UPDATE SET title=excluded.title, path=excluded.path, parent_slug=excluded.parent_slug, updated_at=excluded.updated_at, is_folder=excluded.is_folder`,
			u.ID,
			targetSlug,
			title,
			path,
			parentVal,
			now,
			boolToInt(isFolder),
		); err != nil {
			docErr(w, http.StatusInternalServerError, "db update failed")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"slug": targetSlug})
	}
}

func draftDeleteHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := auth.UserFromContext(r)
		if u == nil {
			httpx.WriteErrorMessage(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		slug := cleanSlugParam(chi.URLParam(r, "*"))
		if slug == "" {
			docErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		var path string
		if err := db.QueryRow(
			`SELECT path FROM user_drafts WHERE user_id = ? AND slug = ?`,
			u.ID,
			slug,
		).Scan(&path); err != nil {
			if err == sql.ErrNoRows {
				docErr(w, http.StatusNotFound, "not found")
				return
			}
			docErr(w, http.StatusInternalServerError, "query error")
			return
		}
		_ = os.Remove(path)
		cleanupDraftDirs(path, u.Username)
		db.Exec(`DELETE FROM user_drafts WHERE user_id = ? AND slug = ?`, u.ID, slug)
		w.WriteHeader(http.StatusNoContent)
	}
}

func clearUserDraftBySlug(db *sql.DB, user *auth.User, slug string) {
	if user == nil || strings.TrimSpace(slug) == "" {
		return
	}
	var path string
	if err := db.QueryRow(
		`SELECT path FROM user_drafts WHERE user_id = ? AND slug = ?`,
		user.ID,
		slug,
	).Scan(&path); err != nil {
		return
	}
	_ = os.Remove(path)
	cleanupDraftDirs(path, user.Username)
	db.Exec(`DELETE FROM user_drafts WHERE user_id = ? AND slug = ?`, user.ID, slug)
}

func draftPathFromSlug(username, slug string, preferIndex bool) (string, bool, error) {
	root, err := draftRootForUser(username)
	if err != nil {
		return "", false, err
	}
	cleaned, explicitIndex := slugParamInfo(slug)
	if cleaned == "" {
		return "", false, fmt.Errorf("missing slug")
	}
	if strings.Contains(cleaned, "..") {
		return "", false, fmt.Errorf("invalid slug")
	}
	rel := filepath.FromSlash(cleaned)

	fileCandidate := filepath.Join(root, rel)
	if !strings.HasSuffix(strings.ToLower(fileCandidate), ".md") {
		fileCandidate += ".md"
	}
	indexCandidate := filepath.Join(root, rel, "_index.md")

	if explicitIndex {
		abs, err := absoluteDraftPath(indexCandidate, root)
		return abs, true, err
	}
	if _, err := os.Stat(fileCandidate); err == nil {
		abs, err := absoluteDraftPath(fileCandidate, root)
		return abs, false, err
	}
	if _, err := os.Stat(indexCandidate); err == nil {
		abs, err := absoluteDraftPath(indexCandidate, root)
		return abs, true, err
	}
	if preferIndex {
		abs, err := absoluteDraftPath(indexCandidate, root)
		return abs, true, err
	}
	abs, err := absoluteDraftPath(fileCandidate, root)
	return abs, false, err
}

func draftRootForUser(username string) (string, error) {
	root := contentpath.DraftsRoot
	if root == "" {
		return "", fmt.Errorf("drafts root not configured")
	}
	ownerDir := draftOwnerDir(username)
	return filepath.Join(root, ownerDir), nil
}

func draftOwnerDir(username string) string {
	clean := strings.TrimSpace(username)
	clean = strings.ReplaceAll(clean, "\\", "_")
	clean = strings.ReplaceAll(clean, "/", "_")
	clean = strings.ReplaceAll(clean, "..", "_")
	clean = strings.Trim(clean, ".")
	if clean == "" {
		return "unknown"
	}
	return clean
}

func absoluteDraftPath(candidate, root string) (string, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	absCandidate, err := filepath.Abs(candidate)
	if err != nil {
		return "", err
	}
	if absCandidate != absRoot && !strings.HasPrefix(absCandidate, absRoot+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid slug")
	}
	return absCandidate, nil
}

func cleanupDraftDirs(path, username string) {
	root, err := draftRootForUser(username)
	if err != nil {
		return
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return
	}
	dir := filepath.Dir(path)
	for {
		absDir, err := filepath.Abs(dir)
		if err != nil {
			return
		}
		if absDir == absRoot {
			return
		}
		entries, err := os.ReadDir(absDir)
		if err != nil || len(entries) > 0 {
			return
		}
		_ = os.Remove(absDir)
		dir = filepath.Dir(absDir)
	}
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
