package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"atlas/internal/httpx"
	"atlas/internal/random"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

func registerBootstrapRoutes(r chi.Router, db *sql.DB) {

	r.Get("/bootstrap", func(w http.ResponseWriter, r *http.Request) {
		var docsCount int
		if err := db.QueryRow(`SELECT COUNT(1) FROM documents`).Scan(&docsCount); err != nil {
			httpErr(w, http.StatusInternalServerError, "documents count failed")
			return
		}
		var usersCount int
		if err := db.QueryRow(`SELECT COUNT(1) FROM users`).Scan(&usersCount); err != nil {
			httpErr(w, http.StatusInternalServerError, "users count failed")
			return
		}
		var bootID string
		if err := db.QueryRow(`SELECT value FROM meta WHERE key = 'boot_id'`).Scan(&bootID); err != nil {
			bootID = ""
		}
		var startPageSlug sql.NullString
		if err := db.QueryRow(`SELECT value FROM meta WHERE key = 'start_page'`).Scan(&startPageSlug); err != nil {
			startPageSlug.String = ""
			startPageSlug.Valid = false
		}
		var timezone sql.NullString
		if err := db.QueryRow(`SELECT value FROM meta WHERE key = 'timezone'`).Scan(&timezone); err != nil {
			timezone.String = ""
			timezone.Valid = false
		}
		var appTitle sql.NullString
		if err := db.QueryRow(`SELECT value FROM meta WHERE key = 'app_title'`).Scan(&appTitle); err != nil {
			appTitle.String = ""
			appTitle.Valid = false
		}
		var appIcon sql.NullString
		if err := db.QueryRow(`SELECT value FROM meta WHERE key = 'app_icon'`).Scan(&appIcon); err != nil {
			appIcon.String = ""
			appIcon.Valid = false
		}
		fresh := usersCount == 0 && startPageSlug.String == ""
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
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
		w.WriteHeader(http.StatusNoContent)
	})

	r.Put("/bootstrap/app-title", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ AppTitle string }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
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
		w.WriteHeader(http.StatusNoContent)
	})

	r.Post("/setup/finish", func(w http.ResponseWriter, r *http.Request) {
		var usersCount int
		if err := db.QueryRow(`SELECT COUNT(1) FROM users`).Scan(&usersCount); err != nil {
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
			hash, err := bcrypt.GenerateFromPassword([]byte(s.Password), bcrypt.DefaultCost)
			if err != nil {
				httpErr(w, http.StatusInternalServerError, "hash error")
				return
			}
			res, err := tx.Exec(`INSERT INTO users(username,password_hash,role) VALUES(?,?,?)`, s.Username, hash, s.Role)
			if err != nil {

				msg := strings.ToLower(err.Error())
				if strings.Contains(msg, "unique") || strings.Contains(msg, "constraint") {
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

		token := random.GenerateToken(32)
		expires := time.Now().Add(7 * 24 * time.Hour)
		if _, err := tx.Exec(`INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)`, token, ownerID, expires.Format(time.RFC3339)); err != nil {
			httpErr(w, http.StatusInternalServerError, "session error")
			return
		}

		if _, err := tx.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('setup_complete','1')`); err != nil {
			httpErr(w, http.StatusInternalServerError, "meta error")
			return
		}

		var bootID string
		if err := tx.QueryRow(`SELECT value FROM meta WHERE key = 'boot_id'`).Scan(&bootID); err != nil || bootID == "" {
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

		cookie := &http.Cookie{Name: "session_token", Value: token, Path: "/", Expires: expires, HttpOnly: true, SameSite: http.SameSiteLaxMode}
		http.SetCookie(w, cookie)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"id": ownerID, "username": "owner", "role": "Owner"})
	})

	r.Post("/bootstrap/app-icon", func(w http.ResponseWriter, r *http.Request) {

		r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid form data")
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			httpErr(w, http.StatusBadRequest, "missing file")
			return
		}
		defer file.Close()

		sniff := make([]byte, 512)
		n, err := io.ReadFull(file, sniff)
		if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
			httpErr(w, http.StatusBadRequest, "invalid image file")
			return
		}
		url, _, err := storeUploadedImage(file, sniff[:n])
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
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"url": url})
	})

	r.Delete("/bootstrap/app-icon", func(w http.ResponseWriter, r *http.Request) {
		if _, err := db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('app_icon','')`); err != nil {
			httpErr(w, http.StatusInternalServerError, "unable to clear icon")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
