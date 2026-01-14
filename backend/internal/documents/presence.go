package documents

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"atlas/internal/auth"
	"atlas/internal/httpx"

	"github.com/go-chi/chi/v5"
)

const presenceTTL = 45 * time.Second

type editorPresenceRow struct {
	UserID    int    `json:"user_id"`
	Username  string `json:"username"`
	UpdatedAt string `json:"updated_at"`
}

func documentPresenceListHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := cleanSlugParam(chi.URLParam(r, "*"))
		if slug == "" {
			httpx.WriteErrorMessage(w, http.StatusBadRequest, "missing slug")
			return
		}
		u := auth.UserFromContext(r)
		if u == nil {
			httpx.WriteErrorMessage(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		if !presenceAllowed(db, slug, u.Username) {
			httpx.WriteErrorMessage(w, http.StatusNotFound, "not found")
			return
		}
		cutoff := time.Now().Add(-presenceTTL).Unix()
		rows, err := db.Query(
			`SELECT user_id, username, updated_at FROM editor_presence WHERE slug = ? AND updated_at >= ? ORDER BY updated_at DESC`,
			slug,
			cutoff,
		)
		if err != nil {
			httpx.WriteErrorMessage(w, http.StatusInternalServerError, "presence lookup failed")
			return
		}
		defer rows.Close()

		out := []editorPresenceRow{}
		for rows.Next() {
			var row editorPresenceRow
			var updated int64
			if err := rows.Scan(&row.UserID, &row.Username, &updated); err != nil {
				httpx.WriteErrorMessage(w, http.StatusInternalServerError, "presence scan failed")
				return
			}
			row.UpdatedAt = time.Unix(updated, 0).UTC().Format(time.RFC3339)
			out = append(out, row)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}

func documentPresenceUpdateHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := cleanSlugParam(chi.URLParam(r, "*"))
		if slug == "" {
			httpx.WriteErrorMessage(w, http.StatusBadRequest, "missing slug")
			return
		}
		u := auth.UserFromContext(r)
		if u == nil {
			httpx.WriteErrorMessage(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		if !presenceAllowed(db, slug, u.Username) {
			httpx.WriteErrorMessage(w, http.StatusNotFound, "not found")
			return
		}
		now := time.Now().UTC().Unix()
		if _, err := db.Exec(
			`INSERT INTO editor_presence (slug, user_id, username, updated_at)
			 VALUES(?,?,?,?)
			 ON CONFLICT(slug, user_id) DO UPDATE SET username=excluded.username, updated_at=excluded.updated_at`,
			slug,
			u.ID,
			u.Username,
			now,
		); err != nil {
			httpx.WriteErrorMessage(w, http.StatusInternalServerError, "presence update failed")
			return
		}
		cutoff := now - int64(presenceTTL.Seconds())
		db.Exec(`DELETE FROM editor_presence WHERE updated_at < ?`, cutoff)
		w.WriteHeader(http.StatusNoContent)
	}
}

func presenceAllowed(db *sql.DB, slug, username string) bool {
	var status sql.NullString
	if err := db.QueryRow(`SELECT status FROM documents WHERE slug = ?`, slug).Scan(&status); err != nil {
		if err == sql.ErrNoRows {
			return false
		}
		return false
	}
	return status.Valid
}
