package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"atlas/internal/auth"
	"atlas/internal/documents"
	"atlas/internal/prefs"

	"github.com/go-chi/chi/v5"
)

func registerPreferenceRoutes(r chi.Router, db *sql.DB) {

	r.With(auth.AuthMiddleware(db)).Get("/user/preferences", prefs.GetUserPrefsHandler(db))
	r.With(auth.AuthMiddleware(db)).Put("/user/preferences", prefs.PutUserPrefsHandler(db))

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Put("/start-page", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Slug string }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Slug) == "" {
			httpErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		slug := strings.TrimSpace(req.Slug)
		var count int
		if err := db.QueryRow(`SELECT COUNT(1) FROM documents WHERE slug = ?`, slug).Scan(&count); err != nil || count == 0 {
			httpErr(w, http.StatusNotFound, "page not found")
			return
		}
		if err := documents.SetStartPageSlug(db, slug); err != nil {
			httpErr(w, http.StatusInternalServerError, "failed to set start page")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Delete("/start-page", func(w http.ResponseWriter, r *http.Request) {
		if err := documents.SetStartPageSlug(db, ""); err != nil {
			httpErr(w, http.StatusInternalServerError, "failed to remove start page")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
