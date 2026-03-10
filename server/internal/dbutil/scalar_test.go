package dbutil

import (
	"database/sql"
	"errors"
	"testing"

	_ "modernc.org/sqlite"
)

func TestScalarReturnsValue(t *testing.T) {
	db := openTestDB(t)

	if _, err := db.Exec(`CREATE TABLE counts (value INTEGER NOT NULL)`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO counts(value) VALUES (7)`); err != nil {
		t.Fatalf("insert row: %v", err)
	}

	got, err := Scalar[int](db, `SELECT value FROM counts LIMIT 1`)
	if err != nil {
		t.Fatalf("Scalar() error = %v", err)
	}
	if got != 7 {
		t.Fatalf("Scalar() = %d, want 7", got)
	}
}

func TestScalarReturnsErrNoRows(t *testing.T) {
	db := openTestDB(t)

	if _, err := db.Exec(`CREATE TABLE values_table (value TEXT)`); err != nil {
		t.Fatalf("create table: %v", err)
	}

	_, err := Scalar[string](db, `SELECT value FROM values_table LIMIT 1`)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("Scalar() error = %v, want sql.ErrNoRows", err)
	}
}

func TestScalarOrZeroSwallowsErrNoRows(t *testing.T) {
	db := openTestDB(t)

	if _, err := db.Exec(`CREATE TABLE values_table (value TEXT)`); err != nil {
		t.Fatalf("create table: %v", err)
	}

	got, err := ScalarOrZero[string](db, `SELECT value FROM values_table LIMIT 1`)
	if err != nil {
		t.Fatalf("ScalarOrZero() error = %v", err)
	}
	if got != "" {
		t.Fatalf("ScalarOrZero() = %q, want empty string", got)
	}
}

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})
	return db
}
