package documents

import (
	"database/sql"
	"log"
	"os"
	"strings"
)

type creationHistorySource struct {
	slug  string
	path  string
	owner string
	raw   []byte
}

func creationHistoryNote(owner string) string {
	normalized := strings.TrimSpace(owner)
	if normalized == "" {
		normalized = "owner"
	}
	return normalized + " created"
}

func ensureCreationHistoryEntries(db *sql.DB, sources []creationHistorySource) error {
	if db == nil || len(sources) == 0 {
		return nil
	}

	for _, source := range sources {
		slug := strings.TrimSpace(source.slug)
		if slug == "" {
			continue
		}

		var historyCount int
		if err := db.QueryRow(`SELECT COUNT(1) FROM history WHERE page_slug = ?`, slug).Scan(&historyCount); err != nil {
			return err
		}
		if historyCount > 0 {
			continue
		}

		data := source.raw
		if len(data) == 0 {
			raw, err := os.ReadFile(source.path)
			if err != nil {
				log.Printf("history backfill read %s: %v", slug, err)
				continue
			}
			data = raw
		}

		recordHistory(db, slug, creationHistoryNote(source.owner), data)
	}

	return nil
}

func EnsureDocumentCreationHistory(db *sql.DB) error {
	if db == nil {
		return nil
	}

	rows, err := db.Query(`
		SELECT d.slug, d.path, COALESCE(d.owner, '')
		FROM documents d
		WHERE NOT EXISTS (
			SELECT 1 FROM history h WHERE h.page_slug = d.slug
		)
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	sources := make([]creationHistorySource, 0)
	for rows.Next() {
		var slug string
		var path sql.NullString
		var owner sql.NullString
		if err := rows.Scan(&slug, &path, &owner); err != nil {
			return err
		}
		sources = append(sources, creationHistorySource{
			slug:  slug,
			path:  path.String,
			owner: owner.String,
		})
	}
	if err := rows.Err(); err != nil {
		return err
	}

	return ensureCreationHistoryEntries(db, sources)
}
