package api

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"

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
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"path": path, "sig": sig})
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
		_, _ = db.Exec(`DELETE FROM meta WHERE key = ?`, "seed_default_content_v1")

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
		for _, legacyDocsPath := range []string{
			filepath.Clean(filepath.Join("..", "backend", "docs")),
			filepath.Clean(filepath.Join("backend", "docs")),
		} {
			removeLegacyPath(legacyDocsPath)
		}

		_ = os.RemoveAll(contentpath.HistoryRoot)
		_ = os.RemoveAll(contentpath.UploadsRoot)
		removeLegacyData := func(target string) {
			targetAbs, err := filepath.Abs(target)
			if err != nil {
				return
			}
			currentAbs, err := filepath.Abs(contentpath.DataRoot)
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
		for _, legacyDataPath := range []string{
			filepath.Clean(filepath.Join("..", "backend", "data")),
			filepath.Clean(filepath.Join("backend", "data")),
		} {
			removeLegacyData(legacyDataPath)
		}
		if !keepBackups {
			_ = os.RemoveAll(contentpath.BackupsRoot)
		}

		if err := contentpath.EnsureRuntimeDirs(); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "RESET_DIRS_FAILED", err.Error())
			return
		}
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	})

	r.With(auth.AuthMiddleware(db)).Get("/backups", func(w http.ResponseWriter, r *http.Request) {
		list, err := backup.ListBackups()
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "list failed")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, list)
	})

	r.With(auth.AuthMiddleware(db)).Get("/backup/file", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("file")
		if q == "" {
			httpErr(w, http.StatusBadRequest, "missing file")
			return
		}
		bp, err := contentpath.ResolveWithinBase(contentpath.BackupsRoot, q)
		if err != nil {
			httpErr(w, http.StatusBadRequest, "invalid file")
			return
		}
		info, err := os.Stat(bp)
		if err != nil {
			httpErr(w, http.StatusNotFound, "not found")
			return
		}
		if info.IsDir() {
			httpErr(w, http.StatusBadRequest, "invalid file")
			return
		}
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", "attachment; filename=\""+filepath.Base(bp)+"\"")
		http.ServeFile(w, r, bp)
	})

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Post("/backups/upload", func(w http.ResponseWriter, r *http.Request) {
		upload, ok := parseMultipartUploadOrRespond(w, r, 50<<20, uploadErrorMessages{
			invalidFormData: "invalid form",
			missingUpload:   "missing file",
			invalidFile:     "invalid file",
			serverError:     "save failed",
		})
		if !ok {
			return
		}
		defer upload.File.Close()

		name := filepath.Base(upload.Header.Filename)
		if err := contentpath.EnsureDirs(contentpath.BackupsRoot); err != nil {
			httpErr(w, http.StatusInternalServerError, "save failed")
			return
		}
		dst, err := backup.SaveUploadedBackup(upload.Reader(), name)
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
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"file": name})
	})

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Post("/backup/restore", func(w http.ResponseWriter, r *http.Request) {
		if restoreCh == nil {
			httpx.WriteError(w, http.StatusInternalServerError, "RESTORE_DISABLED", "restore channel unavailable")
			return
		}
		var req struct{ File string }
		if err := httpx.ReadJSON(r, &req); err != nil || req.File == "" {
			httpErr(w, http.StatusBadRequest, "missing file")
			return
		}
		path, err := contentpath.ResolveWithinBase(contentpath.BackupsRoot, req.File)
		if err != nil {
			httpErr(w, http.StatusBadRequest, "invalid file")
			return
		}
		if info, statErr := os.Stat(path); statErr != nil || info.IsDir() {
			httpErr(w, http.StatusBadRequest, "invalid file")
			return
		}
		ok, err := backup.VerifyBackup(path)
		if err != nil || !ok {
			httpErr(w, http.StatusBadRequest, "backup verify failed")
			return
		}
		stagingDir := filepath.Join(contentpath.BackupsRoot, "tmp_restore")
		_ = os.RemoveAll(stagingDir)
		if err := contentpath.EnsureDirs(stagingDir); err != nil {
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
