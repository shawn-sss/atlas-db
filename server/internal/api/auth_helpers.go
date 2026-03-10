package api

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"atlas/internal/random"

	"golang.org/x/crypto/bcrypt"
)

type sqlExecer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

func createUserRecord(exec sqlExecer, username, password, role string) (sql.Result, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	return exec.Exec(
		`INSERT INTO users(username,password_hash,role) VALUES(?,?,?)`,
		username,
		hash,
		role,
	)
}

func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique") || strings.Contains(msg, "constraint")
}

func normalizeUserRole(raw string, defaultRole string) (string, bool) {
	role := strings.TrimSpace(raw)
	if role == "" {
		role = defaultRole
	}
	switch strings.ToLower(role) {
	case "user":
		return "User", true
	case "admin":
		return "Admin", true
	case "owner":
		return "Owner", true
	default:
		return "", false
	}
}

func createSessionRecord(exec sqlExecer, userID int64) (string, time.Time, error) {
	token := random.GenerateToken(32)
	expires := time.Now().Add(7 * 24 * time.Hour)
	_, err := exec.Exec(
		`INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)`,
		token,
		userID,
		expires.Format(time.RFC3339),
	)
	return token, expires, err
}

func writeSessionCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}
