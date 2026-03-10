package documents

import (
	"database/sql"
	"log"
	"strings"

	"atlas/internal/dbutil"
)

func AlignStartPageFlag(db *sql.DB) error {
	slug, err := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM meta WHERE key = 'start_page'`)
	if err != nil {
		return err
	}
	target := strings.TrimSpace(slug.String)
	if target == "" {
		if _, err := db.Exec(`UPDATE documents SET is_start_page = 0`); err != nil {
			return err
		}
		return nil
	}
	if _, err := db.Exec(`UPDATE documents SET is_start_page = CASE WHEN slug = ? THEN 1 ELSE 0 END`, target); err != nil {
		return err
	}
	return nil
}

func SetStartPageSlug(db *sql.DB, slug string) error {
	clean := strings.TrimSpace(slug)
	if clean == "" {
		if _, err := db.Exec(`UPDATE documents SET is_start_page = 0`); err != nil {
			return err
		}
		if _, err := db.Exec(`DELETE FROM meta WHERE key = 'start_page'`); err != nil {
			return err
		}
		return nil
	}
	if _, err := db.Exec(`UPDATE documents SET is_start_page = CASE WHEN slug = ? THEN 1 ELSE 0 END`, clean); err != nil {
		return err
	}
	if _, err := db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('start_page',?)`, clean); err != nil {
		return err
	}
	return nil
}

func EnsureStartPageMeta(db *sql.DB, slug string, isFirstPage bool) {
	existing, err := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM meta WHERE key = 'start_page'`)
	if err == nil && existing.String != "" {
		if err := AlignStartPageFlag(db); err != nil {
			log.Printf("start page align: %v", err)
		}
		return
	}
	if err := SetStartPageSlug(db, slug); err != nil {
		log.Printf("start page meta: %v", err)
	}
}
