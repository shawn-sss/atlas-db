package api

import (
	"database/sql"
	"net/http"
	"strings"

	"atlas/internal/auth"
	"atlas/internal/dbutil"
	"atlas/internal/documents"
	"atlas/internal/httpx"
	"atlas/internal/prefs"

	"github.com/go-chi/chi/v5"
)

func registerPreferenceRoutes(r chi.Router, db *sql.DB) {

	r.With(auth.AuthMiddleware(db)).Get("/user/preferences", prefs.GetUserPrefsHandler(db))
	r.With(auth.AuthMiddleware(db)).Put("/user/preferences", prefs.PutUserPrefsHandler(db))

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Put("/start-page", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Slug string }
		if err := httpx.ReadJSON(r, &req); err != nil || strings.TrimSpace(req.Slug) == "" {
			httpErr(w, http.StatusBadRequest, "missing slug")
			return
		}
		slug := strings.TrimSpace(req.Slug)
		count, err := dbutil.Scalar[int](db, `SELECT COUNT(1) FROM documents WHERE slug = ?`, slug)
		if err != nil || count == 0 {
			httpErr(w, http.StatusNotFound, "page not found")
			return
		}
		if err := documents.SetStartPageSlug(db, slug); err != nil {
			httpErr(w, http.StatusInternalServerError, "failed to set start page")
			return
		}
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	})

	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Delete("/start-page", func(w http.ResponseWriter, r *http.Request) {
		if err := documents.SetStartPageSlug(db, ""); err != nil {
			httpErr(w, http.StatusInternalServerError, "failed to remove start page")
			return
		}
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	})
}
