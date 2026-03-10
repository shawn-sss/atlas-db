package documents

import (
	"database/sql"

	"atlas/internal/auth"

	"github.com/go-chi/chi/v5"
)

func RegisterRoutes(r chi.Router, db *sql.DB) {
	r.Get("/documents", listDocumentsHandler(db))
	r.Get("/documents/search", searchDocumentsHandler(db))
	r.Get("/documents/tree", navTreeHandler(db))
	r.With(auth.AuthMiddleware(db)).Get("/drafts/tree", draftsTreeHandler(db))
	r.With(auth.AuthMiddleware(db)).Get("/draft/*", draftDetailHandler(db))
	r.With(auth.AuthMiddleware(db)).Post("/draft/*", draftSaveHandler(db))
	r.With(auth.AuthMiddleware(db)).Delete("/draft/*", draftDeleteHandler(db))
	r.Get("/document/backlinks/*", backlinksHandler(db))
	r.With(auth.AuthMiddleware(db)).Put("/document/status/*", documentStatusHandler(db))
	r.Get("/document/*", documentDetailHandler(db))
	r.With(auth.AuthMiddleware(db)).Post("/document/*", documentSaveHandler(db))
	r.With(auth.AuthMiddleware(db)).Post("/document/move", moveDocumentHandler(db))
	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Delete("/document/*", documentDeleteHandler(db))
	r.With(auth.AuthMiddleware(db)).Put("/document/pin/*", documentPinHandler(db, true))
	r.With(auth.AuthMiddleware(db)).Delete("/document/pin/*", documentPinHandler(db, false))
	r.With(auth.AuthMiddleware(db)).Put("/document/home/*", documentHomeHandler(db, true))
	r.With(auth.AuthMiddleware(db)).Delete("/document/home/*", documentHomeHandler(db, false))
	r.With(auth.AuthMiddleware(db)).Get("/document/presence/*", documentPresenceListHandler(db))
	r.With(auth.AuthMiddleware(db)).Post("/document/presence/*", documentPresenceUpdateHandler(db))
	r.With(auth.AuthMiddleware(db)).Get("/documenthistory/*", documentHistoryHandler(db))
	r.With(auth.AuthMiddleware(db)).Get("/documenthistory/diff/*", documentHistoryDiffHandler(db))
	r.With(auth.AuthMiddleware(db), auth.RequireRole("Admin", "Owner")).Post("/documentrestore/*", documentRestoreHandler(db))
}
