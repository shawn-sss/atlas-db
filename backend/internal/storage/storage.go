package storage

import (
	"database/sql"
	"log"

	"atlas/internal/documents"
)

func InitDB(db *sql.DB) error {

	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash BLOB NOT NULL,
            role TEXT NOT NULL DEFAULT 'User',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );`,

		`CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id TEXT UNIQUE,
            slug TEXT UNIQUE NOT NULL,
            title TEXT,
            path TEXT NOT NULL,
            parent_slug TEXT,
            status TEXT NOT NULL DEFAULT 'published',
            owner TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME,
            is_start_page INTEGER NOT NULL DEFAULT 0,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            is_home INTEGER NOT NULL DEFAULT 0,
            links TEXT
        );`,

		`CREATE TABLE IF NOT EXISTS audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT,
            target TEXT,
            meta TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );`,

		`CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at DATETIME NOT NULL
        );`,

		`CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_slug TEXT,
            file_path TEXT,
            saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            note TEXT
        );`,

		`CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );`,

		`CREATE TABLE IF NOT EXISTS user_preferences (
			user_id INTEGER NOT NULL,
			key TEXT NOT NULL,
			value TEXT,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY(user_id, key)
		);`,

		`CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(slug, title, body);`,
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	for _, s := range stmts {
		if _, err := tx.Exec(s); err != nil {
			tx.Rollback()
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}

	if err := ensureDocumentSchema(db); err != nil {
		return err
	}

	if err := documents.AlignStartPageFlag(db); err != nil {
		log.Printf("align start page flag: %v", err)
	}
	return nil
}

func ensureDocumentSchema(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(documents)`)
	if err != nil {
		return err
	}
	defer rows.Close()
	found := map[string]bool{}
	for rows.Next() {
		var cid int
		var name string
		var typ string
		var notnull int
		var dflt sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			return err
		}
		found[name] = true
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if !found["doc_id"] {
		if _, err := db.Exec(`ALTER TABLE documents ADD COLUMN doc_id TEXT`); err != nil {
			return err
		}
	}
	if !found["links"] {
		if _, err := db.Exec(`ALTER TABLE documents ADD COLUMN links TEXT`); err != nil {
			return err
		}
	}
	if !found["owner"] {
		if _, err := db.Exec(`ALTER TABLE documents ADD COLUMN owner TEXT`); err != nil {
			return err
		}
	}
	if !found["is_pinned"] {
		if _, err := db.Exec(`ALTER TABLE documents ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`); err != nil {
			return err
		}
	}
	if !found["is_home"] {
		if _, err := db.Exec(`ALTER TABLE documents ADD COLUMN is_home INTEGER NOT NULL DEFAULT 0`); err != nil {
			return err
		}
	}
	if !found["created_at"] {
		if _, err := db.Exec(`ALTER TABLE documents ADD COLUMN created_at DATETIME`); err != nil {
			return err
		}
	}
	if _, err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_doc_id ON documents(doc_id)`); err != nil {
		return err
	}
	return nil
}
