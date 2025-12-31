package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"atlas/internal/auth"
	"atlas/internal/random"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

func registerAuthRoutes(r chi.Router, db *sql.DB) {

	r.Post("/register", func(w http.ResponseWriter, r *http.Request) {
		if strings.TrimSpace(os.Getenv("ALLOW_REGISTRATION")) != "1" {
			httpErr(w, http.StatusForbidden, "registration disabled")
			return
		}

		var req struct{ Username, Password string }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid json")
			return
		}
		req.Username = strings.TrimSpace(req.Username)
		if req.Username == "" || req.Password == "" {
			httpErr(w, http.StatusBadRequest, "missing fields")
			return
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "hash error")
			return
		}
		if _, err := db.Exec(`INSERT INTO users(username,password_hash,role) VALUES(?,?,?)`, req.Username, hash, "User"); err != nil {

			msg := strings.ToLower(err.Error())
			if strings.Contains(msg, "unique") || strings.Contains(msg, "constraint") {
				httpErr(w, http.StatusConflict, "username already exists")
				return
			}
			httpErr(w, http.StatusInternalServerError, "create user failed")
			return
		}
		w.WriteHeader(http.StatusCreated)
	})

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Post("/users", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Username, Password, Role string }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid json")
			return
		}
		req.Username = strings.TrimSpace(req.Username)
		if req.Username == "" || req.Password == "" {
			httpErr(w, http.StatusBadRequest, "missing fields")
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "hash error")
			return
		}
		role := req.Role
		if role == "" {
			role = "User"
		}
		if _, err := db.Exec(`INSERT INTO users(username,password_hash,role) VALUES(?,?,?)`, req.Username, hash, role); err != nil {
			httpErr(w, http.StatusInternalServerError, "create user failed")
			return
		}
		w.WriteHeader(http.StatusCreated)
	})

	r.Post("/login", func(w http.ResponseWriter, r *http.Request) {
		var creds struct{ Username, Password string }
		json.NewDecoder(r.Body).Decode(&creds)
		creds.Username = strings.TrimSpace(creds.Username)
		row := db.QueryRow("SELECT id,password_hash,role FROM users WHERE username = ?", creds.Username)
		var id int
		var hash []byte
		var role string
		if err := row.Scan(&id, &hash, &role); err != nil {
			httpErr(w, http.StatusUnauthorized, "invalid")
			return
		}
		if bcrypt.CompareHashAndPassword(hash, []byte(creds.Password)) != nil {
			httpErr(w, http.StatusUnauthorized, "invalid")
			return
		}
		token := random.GenerateToken(32)
		expires := time.Now().Add(7 * 24 * time.Hour)
		_, err := db.Exec(`INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)`, token, id, expires.Format(time.RFC3339))
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "session error")
			return
		}
		cookie := &http.Cookie{Name: "session_token", Value: token, Path: "/", Expires: expires, HttpOnly: true, SameSite: http.SameSiteLaxMode}
		http.SetCookie(w, cookie)
		json.NewEncoder(w).Encode(map[string]any{"id": id, "username": creds.Username, "role": role})
	})

	r.With(auth.AuthMiddleware(db)).Post("/upload-image", func(w http.ResponseWriter, r *http.Request) {

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
		url, mimeType, err := storeUploadedImage(file, sniff[:n])
		if err != nil {
			if errors.Is(err, errUnsupportedImageType) {
				httpErr(w, http.StatusBadRequest, "unsupported image type")
				return
			}
			httpErr(w, http.StatusInternalServerError, "server error")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"url": url, "mime": mimeType})
	})

	r.Post("/logout", func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie("session_token")
		if err == nil {
			db.Exec(`DELETE FROM sessions WHERE token = ?`, c.Value)
			cookie := &http.Cookie{Name: "session_token", Value: "", Path: "/", Expires: time.Unix(0, 0), HttpOnly: true}
			http.SetCookie(w, cookie)
		}
		w.WriteHeader(http.StatusNoContent)
	})

	r.Get("/me", func(w http.ResponseWriter, r *http.Request) {
		u, err := auth.GetUserFromRequest(r, db)
		if err != nil || u == nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"id": u.ID, "username": u.Username, "role": u.Role})
	})
}
