package prefs

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"atlas/internal/auth"
	"atlas/internal/dbutil"
	"atlas/internal/httpx"
)

func GetUserPrefsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := auth.UserFromContext(r)
		if u == nil {
			httpx.WriteErrorMessage(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		raw, err := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM user_preferences WHERE user_id = ? AND key = 'prefs'`, u.ID)
		if err != nil {
			httpx.WriteErrorMessage(w, http.StatusInternalServerError, "query failed")
			return
		}
		if !raw.Valid || raw.String == "" {
			httpx.WriteRawJSON(w, http.StatusOK, []byte("{}"))
			return
		}
		httpx.WriteRawJSON(w, http.StatusOK, []byte(raw.String))
	}
}

func PutUserPrefsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := auth.UserFromContext(r)
		if u == nil {
			httpx.WriteErrorMessage(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		var payload map[string]any
		if err := httpx.ReadJSON(r, &payload); err != nil {
			httpx.WriteErrorMessage(w, http.StatusBadRequest, "invalid json")
			return
		}
		b, err := json.Marshal(payload)
		if err != nil {
			httpx.WriteErrorMessage(w, http.StatusInternalServerError, "encode error")
			return
		}
		if _, err := db.Exec(`INSERT OR REPLACE INTO user_preferences(user_id,key,value,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)`, u.ID, "prefs", string(b)); err != nil {
			httpx.WriteErrorMessage(w, http.StatusInternalServerError, "save failed")
			return
		}
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	}
}
