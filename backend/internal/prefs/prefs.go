package prefs

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"atlas/internal/auth"
)

func GetUserPrefsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := auth.UserFromContext(r)
		if u == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var raw sql.NullString
		row := db.QueryRow(`SELECT value FROM user_preferences WHERE user_id = ? AND key = 'prefs'`, u.ID)
		if err := row.Scan(&raw); err != nil && err != sql.ErrNoRows {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if !raw.Valid || raw.String == "" {
			w.Write([]byte(`{}`))
			return
		}
		w.Write([]byte(raw.String))
	}
}

func PutUserPrefsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := auth.UserFromContext(r)
		if u == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		b, err := json.Marshal(payload)
		if err != nil {
			http.Error(w, "encode error", http.StatusInternalServerError)
			return
		}
		if _, err := db.Exec(`INSERT OR REPLACE INTO user_preferences(user_id,key,value,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)`, u.ID, "prefs", string(b)); err != nil {
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
