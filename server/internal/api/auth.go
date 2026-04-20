package api

import (
	"database/sql"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"atlas/internal/auth"
	"atlas/internal/httpx"

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
		if err := httpx.ReadJSON(r, &req); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid json")
			return
		}
		req.Username = strings.TrimSpace(req.Username)
		if req.Username == "" || req.Password == "" {
			httpErr(w, http.StatusBadRequest, "missing fields")
			return
		}
		if _, err := createUserRecord(db, req.Username, req.Password, "User"); err != nil {
			if isUniqueConstraintError(err) {
				httpErr(w, http.StatusConflict, "username already exists")
				return
			}
			httpErr(w, http.StatusInternalServerError, "create user failed")
			return
		}
		httpx.WriteJSON(w, http.StatusCreated, nil)
	})

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Post("/users", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Username, Password, Role string }
		if err := httpx.ReadJSON(r, &req); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid json")
			return
		}
		req.Username = strings.TrimSpace(req.Username)
		if req.Username == "" || req.Password == "" {
			httpErr(w, http.StatusBadRequest, "missing fields")
			return
		}
		role, ok := normalizeUserRole(req.Role, "User")
		if !ok {
			httpErr(w, http.StatusBadRequest, "invalid role")
			return
		}
		if role == "Owner" {
			u := auth.UserFromContext(r)
			if u == nil || !strings.EqualFold(u.Role, "Owner") {
				httpx.WriteError(w, http.StatusForbidden, "FORBIDDEN", "only owners can create owner accounts")
				return
			}
		}
		if _, err := createUserRecord(db, req.Username, req.Password, role); err != nil {
			if isUniqueConstraintError(err) {
				httpErr(w, http.StatusConflict, "username already exists")
				return
			}
			httpErr(w, http.StatusInternalServerError, "create user failed")
			return
		}
		httpx.WriteJSON(w, http.StatusCreated, nil)
	})

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Get("/users", func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`SELECT id, username, role FROM users ORDER BY username`)
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "users lookup failed")
			return
		}
		defer rows.Close()

		type userRow struct {
			ID       int    `json:"id"`
			Username string `json:"username"`
			Role     string `json:"role"`
		}
		var users []userRow
		for rows.Next() {
			var row userRow
			if err := rows.Scan(&row.ID, &row.Username, &row.Role); err != nil {
				httpErr(w, http.StatusInternalServerError, "users scan failed")
				return
			}
			users = append(users, row)
		}
		httpx.WriteJSON(w, http.StatusOK, users)
	})

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Owner")).Put("/users/{id}/role", func(w http.ResponseWriter, r *http.Request) {
		idParam := chi.URLParam(r, "id")
		userID, err := strconv.Atoi(idParam)
		if err != nil || userID <= 0 {
			httpErr(w, http.StatusBadRequest, "invalid user id")
			return
		}
		var req struct{ Role string }
		if err := httpx.ReadJSON(r, &req); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid json")
			return
		}
		role, ok := normalizeUserRole(req.Role, "")
		if !ok {
			httpErr(w, http.StatusBadRequest, "invalid role")
			return
		}
		var currentRole string
		if err := db.QueryRow(`SELECT role FROM users WHERE id = ?`, userID).Scan(&currentRole); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				httpErr(w, http.StatusNotFound, "user not found")
				return
			}
			httpErr(w, http.StatusInternalServerError, "lookup failed")
			return
		}
		if strings.EqualFold(currentRole, "Owner") && !strings.EqualFold(role, "Owner") {
			var ownerCount int
			if err := db.QueryRow(`SELECT COUNT(1) FROM users WHERE role = 'Owner'`).Scan(&ownerCount); err != nil {
				httpErr(w, http.StatusInternalServerError, "owner count failed")
				return
			}
			if ownerCount <= 1 {
				httpx.WriteError(w, http.StatusConflict, "LAST_OWNER", "at least one owner account is required")
				return
			}
		}
		if _, err := db.Exec(`UPDATE users SET role = ? WHERE id = ?`, role, userID); err != nil {
			httpErr(w, http.StatusInternalServerError, "update role failed")
			return
		}
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	})

	r.Post("/login", func(w http.ResponseWriter, r *http.Request) {
		var creds struct{ Username, Password string }
		if err := httpx.ReadJSON(r, &creds); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid json")
			return
		}
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
		token, expires, err := createSessionRecord(db, int64(id))
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "session error")
			return
		}
		writeSessionCookie(w, token, expires)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"id": id, "username": creds.Username, "role": role})
	})

	r.With(auth.AuthMiddleware(db)).Post("/upload-image", func(w http.ResponseWriter, r *http.Request) {
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

		url, mimeType, err := storeUploadedImage(upload.File, upload.Sniff)
		if err != nil {
			if errors.Is(err, errUnsupportedImageType) {
				httpErr(w, http.StatusBadRequest, "unsupported image type")
				return
			}
			httpErr(w, http.StatusInternalServerError, "server error")
			return
		}

		httpx.WriteJSON(w, http.StatusOK, map[string]string{"url": url, "mime": mimeType})
	})

	r.Post("/logout", func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie("session_token")
		if err == nil {
			db.Exec(`DELETE FROM sessions WHERE token = ?`, c.Value)
			clearSessionCookie(w)
		}
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	})

	r.With(auth.AuthMiddleware(db)).Get("/active-users", func(w http.ResponseWriter, r *http.Request) {
		now := time.Now().UTC().Format(time.RFC3339)
		rows, err := db.Query(`SELECT DISTINCT u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.expires_at > ? ORDER BY u.username`, now)
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "active users lookup failed")
			return
		}
		defer rows.Close()

		var users []string
		for rows.Next() {
			var username string
			if err := rows.Scan(&username); err != nil {
				httpErr(w, http.StatusInternalServerError, "active users scan failed")
				return
			}
			username = strings.TrimSpace(username)
			if username != "" {
				users = append(users, username)
			}
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"count": len(users),
			"users": users,
		})
	})

	r.Get("/me", func(w http.ResponseWriter, r *http.Request) {
		u, err := auth.GetUserFromRequest(r, db)
		if err != nil || u == nil {
			httpx.WriteJSON(w, http.StatusNoContent, nil)
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"id": u.ID, "username": u.Username, "role": u.Role})
	})
}
