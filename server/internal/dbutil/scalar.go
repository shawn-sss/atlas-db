package dbutil

import (
	"database/sql"
	"errors"
)

type ScalarQuerier interface {
	QueryRow(query string, args ...any) *sql.Row
}

func Scalar[T any](db ScalarQuerier, query string, args ...any) (T, error) {
	var value T
	err := db.QueryRow(query, args...).Scan(&value)
	return value, err
}

func ScalarOrZero[T any](db ScalarQuerier, query string, args ...any) (T, error) {
	value, err := Scalar[T](db, query, args...)
	if errors.Is(err, sql.ErrNoRows) {
		var zero T
		return zero, nil
	}
	return value, err
}
