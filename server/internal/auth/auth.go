package auth

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"atlas/internal/httpx"
)

type ctxKey string

const userCtxKey ctxKey = "user"

type User struct {
	ID       int
	Username string
	Role     string
}

func AuthMiddleware(db *sql.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, err := GetUserFromRequest(r, db)
			if err != nil || u == nil {
				httpx.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized")
				return
			}
			ctx := context.WithValue(r.Context(), userCtxKey, u)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireRole(allowed ...string) func(http.Handler) http.Handler {
	allowMap := map[string]bool{}
	for _, a := range allowed {
		allowMap[a] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			v := r.Context().Value(userCtxKey)
			if v == nil {
				httpx.WriteError(w, http.StatusForbidden, "FORBIDDEN", "forbidden")
				return
			}
			u := v.(*User)
			if !allowMap[u.Role] {
				httpx.WriteError(w, http.StatusForbidden, "FORBIDDEN", "forbidden")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func UserFromContext(r *http.Request) *User {
	v := r.Context().Value(userCtxKey)
	if v == nil {
		return nil
	}
	return v.(*User)
}

func GetUserFromRequest(r *http.Request, db *sql.DB) (*User, error) {
	c, err := r.Cookie("session_token")
	if err != nil {
		return nil, err
	}
	var userID int
	var expStr string
	row := db.QueryRow(`SELECT user_id,expires_at FROM sessions WHERE token = ?`, c.Value)
	if err := row.Scan(&userID, &expStr); err != nil {
		return nil, err
	}
	if expStr != "" {
		if t, err := time.Parse(time.RFC3339, expStr); err == nil {
			if t.Before(time.Now()) {
				db.Exec(`DELETE FROM sessions WHERE token = ?`, c.Value)
				return nil, nil
			}
		}
	}
	var username, role string
	row2 := db.QueryRow(`SELECT username,role FROM users WHERE id = ?`, userID)
	if err := row2.Scan(&username, &role); err != nil {
		return nil, err
	}
	return &User{ID: userID, Username: username, Role: role}, nil
}
