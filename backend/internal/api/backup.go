package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"atlas/internal/auth"
	"atlas/internal/backup"
	"atlas/internal/contentpath"
	"atlas/internal/httpx"
	"atlas/internal/storage"

	"github.com/go-chi/chi/v5"
)

func registerBackupRoutes(r chi.Router, db *sql.DB, restoreCh chan<- string) {

	r.With(auth.AuthMiddleware(db)).Post("/backup", func(w http.ResponseWriter, r *http.Request) {
		path, sig, err := backup.CreateBackup()
		if err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "BACKUP_CREATE_FAILED", err.Error())
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"path": path, "sig": sig})
	})

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Owner")).Post("/nuke", func(w http.ResponseWriter, r *http.Request) {

		keepBackups := r.URL.Query().Get("keepBackups") == "1"

		drop := `
        DROP TABLE IF EXISTS users;
        DROP TABLE IF EXISTS documents;
        DROP TABLE IF EXISTS audit;
        DROP TABLE IF EXISTS sessions;
        DROP TABLE IF EXISTS history;
        DROP TABLE IF EXISTS editor_presence;
        DROP TABLE IF EXISTS meta;
        DROP TABLE IF EXISTS user_preferences;
        DROP TABLE IF EXISTS user_drafts;
        DROP TABLE IF EXISTS documents_fts;
        `
		if _, err := db.Exec(drop); err != nil {
			httpErr(w, http.StatusInternalServerError, "db drop failed")
			return
		}
		if _, err := db.Exec("VACUUM"); err != nil {

		}
		if err := storage.InitDB(db); err != nil {
			httpErr(w, http.StatusInternalServerError, "reinit failed")
			return
		}
		_, _ = db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)`, "seed_default_content_v1", "nuked")

		_ = os.RemoveAll(contentpath.DocsRoot)
		removeLegacyPath := func(target string) {
			targetAbs, err := filepath.Abs(target)
			if err != nil {
				return
			}
			currentAbs, err := filepath.Abs(contentpath.DocsRoot)
			if err != nil {
				return
			}
			if targetAbs == currentAbs {
				return
			}
			if info, err := os.Stat(targetAbs); err == nil && info.IsDir() {
				_ = os.RemoveAll(targetAbs)
			}
		}
		removeLegacyPath(filepath.Clean(filepath.Join("backend", "docs")))

		_ = os.RemoveAll("./data/history")
		_ = os.RemoveAll("./data/uploads")
		removeLegacyData := func(target string) {
			targetAbs, err := filepath.Abs(target)
			if err != nil {
				return
			}
			currentAbs, err := filepath.Abs("./data")
			if err != nil {
				return
			}
			if targetAbs == currentAbs {
				return
			}
			if info, err := os.Stat(targetAbs); err == nil && info.IsDir() {
				_ = os.RemoveAll(targetAbs)
			}
		}
		removeLegacyData(filepath.Clean(filepath.Join("backend", "data")))
		if !keepBackups {

			_ = os.RemoveAll("./data/backups")
		}

		_ = os.MkdirAll(contentpath.DocsRoot, 0o755)
		_ = os.MkdirAll(contentpath.PublishedRoot, 0o755)
		_ = os.MkdirAll(contentpath.UnlistedRoot, 0o755)
		_ = os.MkdirAll(contentpath.DraftsRoot, 0o755)
		_ = os.MkdirAll("./data/history", 0o755)
		_ = os.MkdirAll("./data/uploads", 0o755)
		if !keepBackups {
			_ = os.MkdirAll("./data/backups", 0o755)
		}
		w.WriteHeader(http.StatusNoContent)
	})

	r.With(auth.AuthMiddleware(db)).Get("/backups", func(w http.ResponseWriter, r *http.Request) {
		list, err := backup.ListBackups()
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "list failed")
			return
		}
		json.NewEncoder(w).Encode(list)
	})

	r.With(auth.AuthMiddleware(db)).Get("/backup/file", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("file")
		if q == "" {
			httpErr(w, http.StatusBadRequest, "missing file")
			return
		}
		clean := filepath.Clean(q)
		bp := filepath.Join("./data/backups", clean)
		bpAbs, _ := filepath.Abs(bp)
		backupsAbs, _ := filepath.Abs(filepath.Join("./data/backups"))
		if !(bpAbs == backupsAbs || strings.HasPrefix(bpAbs, backupsAbs+string(os.PathSeparator))) {
			httpErr(w, http.StatusBadRequest, "invalid file")
			return
		}
		if _, err := os.Stat(bp); err != nil {
			httpErr(w, http.StatusNotFound, "not found")
			return
		}
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", "attachment; filename=\""+filepath.Base(bp)+"\"")
		http.ServeFile(w, r, bp)
	})

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Post("/backups/upload", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(50 << 20); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid form")
			return
		}
		f, fh, err := r.FormFile("file")
		if err != nil {
			httpErr(w, http.StatusBadRequest, "missing file")
			return
		}
		defer f.Close()
		name := filepath.Base(fh.Filename)
		os.MkdirAll("./data/backups", 0o755)
		dst, err := backup.SaveUploadedBackup(f, name)
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "save failed")
			return
		}
		ok, verr := backup.VerifyBackup(dst)
		if verr != nil || !ok {
			httpErr(w, http.StatusBadRequest, "invalid backup signature")
			return
		}
		if u := auth.UserFromContext(r); u != nil {
			db.Exec(`INSERT INTO audit(user_id,action,target,meta) VALUES(?,?,?,?)`, u.ID, "upload_backup", name, "uploaded backup")
		}
		json.NewEncoder(w).Encode(map[string]any{"file": name})
	})

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Post("/backup/restore", func(w http.ResponseWriter, r *http.Request) {
		if restoreCh == nil {
			httpx.WriteError(w, http.StatusInternalServerError, "RESTORE_DISABLED", "restore channel unavailable")
			return
		}
		var req struct{ File string }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.File == "" {
			httpErr(w, http.StatusBadRequest, "missing file")
			return
		}
		clean := filepath.Clean(req.File)
		path := filepath.Join("./data/backups", clean)
		pathAbs, _ := filepath.Abs(path)
		backupsAbs, _ := filepath.Abs(filepath.Join("./data/backups"))
		if !(pathAbs == backupsAbs || strings.HasPrefix(pathAbs, backupsAbs+string(os.PathSeparator))) {
			httpErr(w, http.StatusBadRequest, "invalid file")
			return
		}
		ok, err := backup.VerifyBackup(path)
		if err != nil || !ok {
			httpErr(w, http.StatusBadRequest, "backup verify failed")
			return
		}
		stagingDir := filepath.Join("./data/backups", "tmp_restore")
		_ = os.RemoveAll(stagingDir)
		if err := os.MkdirAll(stagingDir, 0o755); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "RESTORE_STAGE_DIR_FAILED", err.Error())
			return
		}
		if err := stageBackupZip(path, stagingDir); err != nil {
			_ = os.RemoveAll(stagingDir)
			httpx.WriteError(w, http.StatusInternalServerError, "RESTORE_STAGE_FAILED", err.Error())
			return
		}
		select {
		case restoreCh <- stagingDir:
		default:
			_ = os.RemoveAll(stagingDir)
			httpx.WriteError(w, http.StatusConflict, "RESTORE_IN_PROGRESS", "restore already pending")
			return
		}
		if u := auth.UserFromContext(r); u != nil {
			db.Exec(`INSERT INTO audit(user_id,action,target,meta) VALUES(?,?,?,?)`, u.ID, "backup_restore", req.File, "restore requested")
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true, "restart": true})
	})
}
