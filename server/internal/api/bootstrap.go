package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"atlas/internal/dbutil"
	"atlas/internal/httpx"
	"atlas/internal/random"

	"github.com/go-chi/chi/v5"
)

func registerBootstrapRoutes(r chi.Router, db *sql.DB) {

	r.Get("/bootstrap", func(w http.ResponseWriter, r *http.Request) {
		usersCount, err := dbutil.Scalar[int](db, `SELECT COUNT(1) FROM users`)
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "users count failed")
			return
		}
		bootID, err := dbutil.ScalarOrZero[string](db, `SELECT value FROM meta WHERE key = 'boot_id'`)
		if err != nil {
			bootID = ""
		}
		startPageSlug, err := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM meta WHERE key = 'start_page'`)
		if err != nil {
			startPageSlug = sql.NullString{}
		}
		timezone, err := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM meta WHERE key = 'timezone'`)
		if err != nil {
			timezone = sql.NullString{}
		}
		appTitle, err := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM meta WHERE key = 'app_title'`)
		if err != nil {
			appTitle = sql.NullString{}
		}
		appIcon, err := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM meta WHERE key = 'app_icon'`)
		if err != nil {
			appIcon = sql.NullString{}
		}
		fresh := usersCount == 0 && startPageSlug.String == ""
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"fresh":         fresh,
			"bootId":        bootID,
			"startPageSlug": startPageSlug.String,
			"timezone":      timezone.String,
			"appTitle":      appTitle.String,
			"appIcon":       appIcon.String,
		})
	})

	r.Put("/bootstrap/timezone", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Timezone string }
		if err := httpx.ReadJSON(r, &req); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid json")
			return
		}
		v := strings.TrimSpace(req.Timezone)
		if v == "" {
			httpErr(w, http.StatusBadRequest, "missing timezone")
			return
		}
		if len(v) > 128 {
			httpErr(w, http.StatusBadRequest, "timezone too long")
			return
		}
		if _, err := db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('timezone',?)`, v); err != nil {
			httpErr(w, http.StatusInternalServerError, "unable to save timezone")
			return
		}
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	})

	r.Put("/bootstrap/app-title", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ AppTitle string }
		if err := httpx.ReadJSON(r, &req); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid json")
			return
		}
		v := strings.TrimSpace(req.AppTitle)
		if len(v) > 256 {
			httpErr(w, http.StatusBadRequest, "title too long")
			return
		}
		if _, err := db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('app_title',?)`, v); err != nil {
			httpErr(w, http.StatusInternalServerError, "unable to save app title")
			return
		}
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	})

	r.Post("/setup/finish", func(w http.ResponseWriter, r *http.Request) {
		usersCount, err := dbutil.Scalar[int](db, `SELECT COUNT(1) FROM users`)
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "users count failed")
			return
		}
		if usersCount > 0 {
			httpx.WriteError(w, http.StatusConflict, "SETUP_ALREADY_DONE", "setup already completed")
			return
		}

		tx, err := db.Begin()
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "tx error")
			return
		}
		defer tx.Rollback()

		seed := []struct{ Username, Password, Role string }{
			{"owner", "owner", "Owner"},
			{"admin", "admin", "Admin"},
			{"user", "user", "User"},
		}
		var ownerID int64
		for i, s := range seed {
			res, err := createUserRecord(tx, s.Username, s.Password, s.Role)
			if err != nil {
				if isUniqueConstraintError(err) {
					httpx.WriteError(w, http.StatusConflict, "USERS_EXIST", "Users already exist")
					return
				}
				httpErr(w, http.StatusInternalServerError, "create user failed")
				return
			}
			if i == 0 {
				ownerID, _ = res.LastInsertId()
			}
		}

		token, expires, err := createSessionRecord(tx, ownerID)
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "session error")
			return
		}

		if _, err := tx.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('setup_complete','1')`); err != nil {
			httpErr(w, http.StatusInternalServerError, "meta error")
			return
		}

		bootID, err := dbutil.ScalarOrZero[string](tx, `SELECT value FROM meta WHERE key = 'boot_id'`)
		if err != nil || bootID == "" {
			bootID = random.GenerateToken(12)
			if _, err := tx.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('boot_id',?)`, bootID); err != nil {
				httpErr(w, http.StatusInternalServerError, "meta boot_id")
				return
			}
		}

		if err := tx.Commit(); err != nil {
			httpErr(w, http.StatusInternalServerError, "commit failed")
			return
		}

		writeSessionCookie(w, token, expires)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"id": ownerID, "username": "owner", "role": "Owner"})
	})

	r.Post("/bootstrap/app-icon", func(w http.ResponseWriter, r *http.Request) {
		upload, ok := parseMultipartUploadOrRespond(w, r, 10<<20, uploadErrorMessages{
			invalidFormData: "invalid form data",
			missingUpload:   "missing file",
			invalidFile:     "invalid image file",
			serverError:     "server error",
		})
		if !ok {
			return
		}
		defer upload.File.Close()

		url, _, err := storeUploadedIcon(upload.File, upload.Sniff)
		if err != nil {
			if errors.Is(err, errUnsupportedImageType) {
				httpErr(w, http.StatusBadRequest, "unsupported image type")
				return
			}
			httpErr(w, http.StatusInternalServerError, "server error")
			return
		}
		if _, err := db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('app_icon',?)`, url); err != nil {
			httpErr(w, http.StatusInternalServerError, "unable to save icon")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"url": url})
	})

	r.Delete("/bootstrap/app-icon", func(w http.ResponseWriter, r *http.Request) {
		if _, err := db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('app_icon','')`); err != nil {
			httpErr(w, http.StatusInternalServerError, "unable to clear icon")
			return
		}
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	})
}
