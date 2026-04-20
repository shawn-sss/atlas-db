package documents

import (
	"database/sql"
	"log"
	"strings"

	"atlas/internal/dbutil"
)

type startPageStore interface {
	QueryRow(query string, args ...any) *sql.Row
	Exec(query string, args ...any) (sql.Result, error)
}

func AlignStartPageFlag(store startPageStore) error {
	slug, err := dbutil.ScalarOrZero[sql.NullString](store, `SELECT value FROM meta WHERE key = 'start_page'`)
	if err != nil {
		return err
	}
	target := strings.TrimSpace(slug.String)
	if target == "" {
		if _, err := store.Exec(`UPDATE documents SET is_start_page = 0`); err != nil {
			return err
		}
		return nil
	}
	if _, err := store.Exec(`UPDATE documents SET is_start_page = CASE WHEN slug = ? THEN 1 ELSE 0 END`, target); err != nil {
		return err
	}
	return nil
}

func SetStartPageSlug(store startPageStore, slug string) error {
	clean := strings.TrimSpace(slug)
	if clean == "" {
		if _, err := store.Exec(`UPDATE documents SET is_start_page = 0`); err != nil {
			return err
		}
		if _, err := store.Exec(`DELETE FROM meta WHERE key = 'start_page'`); err != nil {
			return err
		}
		return nil
	}
	if _, err := store.Exec(`UPDATE documents SET is_start_page = CASE WHEN slug = ? THEN 1 ELSE 0 END`, clean); err != nil {
		return err
	}
	if _, err := store.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('start_page',?)`, clean); err != nil {
		return err
	}
	return nil
}

func EnsureStartPageMeta(store startPageStore, slug string, isFirstPage bool) {
	existing, err := dbutil.ScalarOrZero[sql.NullString](store, `SELECT value FROM meta WHERE key = 'start_page'`)
	if err == nil && existing.String != "" {
		if err := AlignStartPageFlag(store); err != nil {
			log.Printf("start page align: %v", err)
		}
		return
	}
	if err := SetStartPageSlug(store, slug); err != nil {
		log.Printf("start page meta: %v", err)
	}
}
