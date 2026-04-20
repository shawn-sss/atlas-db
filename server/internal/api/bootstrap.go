package api

import (
	"database/sql"
	"errors"
	"net/http"
	"sort"
	"strings"

	"atlas/internal/auth"
	"atlas/internal/dbutil"
	"atlas/internal/documents"
	"atlas/internal/httpx"
	"atlas/internal/random"

	"github.com/go-chi/chi/v5"
)

type seededAccount struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

var defaultSeededAccounts = []seededAccount{
	{Username: "owner", Password: "owner", Role: "Owner"},
	{Username: "admin", Password: "admin", Role: "Admin"},
	{Username: "user", Password: "user", Role: "User"},
}

func bootstrapSeededAccounts() []seededAccount {
	accounts := make([]seededAccount, len(defaultSeededAccounts))
	copy(accounts, defaultSeededAccounts)
	return accounts
}

func hasOnlySeededAccounts(db *sql.DB) (bool, error) {
	rows, err := db.Query(`SELECT username FROM users`)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	usernames := make([]string, 0, len(defaultSeededAccounts))
	for rows.Next() {
		var username string
		if err := rows.Scan(&username); err != nil {
			return false, err
		}
		usernames = append(usernames, strings.ToLower(strings.TrimSpace(username)))
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	if len(usernames) != len(defaultSeededAccounts) {
		return false, nil
	}

	expected := make([]string, len(defaultSeededAccounts))
	for i, account := range defaultSeededAccounts {
		expected[i] = strings.ToLower(strings.TrimSpace(account.Username))
	}
	sort.Strings(usernames)
	sort.Strings(expected)
	for i := range expected {
		if usernames[i] != expected[i] {
			return false, nil
		}
	}
	return true, nil
}

func seedDefaultUsers(exec sqlExecer) error {
	for _, account := range defaultSeededAccounts {
		if _, err := createUserRecord(
			exec,
			account.Username,
			account.Password,
			account.Role,
		); err != nil {
			return err
		}
	}
	return nil
}

func registerBootstrapRoutes(r chi.Router, db *sql.DB) {

	r.Get("/bootstrap", func(w http.ResponseWriter, r *http.Request) {
		usersCount, err := dbutil.Scalar[int](db, `SELECT COUNT(1) FROM users`)
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "users count failed")
			return
		}
		bootID, err := dbutil.ScalarOrZero[string](db, `SELECT value FROM meta WHERE key = 'boot_id'`)
		if err != nil {
			bootID = ""
		}
		startPageSlug, err := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM meta WHERE key = 'start_page'`)
		if err != nil {
			startPageSlug = sql.NullString{}
		}
		timezone, err := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM meta WHERE key = 'timezone'`)
		if err != nil {
			timezone = sql.NullString{}
		}
		appTitle, err := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM meta WHERE key = 'app_title'`)
		if err != nil {
			appTitle = sql.NullString{}
		}
		appIcon, err := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM meta WHERE key = 'app_icon'`)
		if err != nil {
			appIcon = sql.NullString{}
		}
		seededAccountsOnly := false
		if usersCount == len(defaultSeededAccounts) {
			seededAccountsOnly, err = hasOnlySeededAccounts(db)
			if err != nil {
				httpErr(w, http.StatusInternalServerError, "users lookup failed")
				return
			}
		}
		fresh := usersCount == 0 && startPageSlug.String == ""
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"fresh":              fresh,
			"bootId":             bootID,
			"startPageSlug":      startPageSlug.String,
			"timezone":           timezone.String,
			"appTitle":           appTitle.String,
			"appIcon":            appIcon.String,
			"seededAccounts":     bootstrapSeededAccounts(),
			"seededAccountsOnly": seededAccountsOnly,
		})
	})

	r.Put("/bootstrap/timezone", func(w http.ResponseWriter, r *http.Request) {
		if !authorizeBootstrapMutation(w, r, db) {
			return
		}
		var req struct{ Timezone string }
		if err := httpx.ReadJSON(r, &req); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid json")
			return
		}
		v := strings.TrimSpace(req.Timezone)
		if v == "" {
			httpErr(w, http.StatusBadRequest, "missing timezone")
			return
		}
		if len(v) > 128 {
			httpErr(w, http.StatusBadRequest, "timezone too long")
			return
		}
		if _, err := db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('timezone',?)`, v); err != nil {
			httpErr(w, http.StatusInternalServerError, "unable to save timezone")
			return
		}
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	})

	r.Put("/bootstrap/app-title", func(w http.ResponseWriter, r *http.Request) {
		if !authorizeBootstrapMutation(w, r, db) {
			return
		}
		var req struct{ AppTitle string }
		if err := httpx.ReadJSON(r, &req); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid json")
			return
		}
		v := strings.TrimSpace(req.AppTitle)
		if len(v) > 256 {
			httpErr(w, http.StatusBadRequest, "title too long")
			return
		}
		if _, err := db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('app_title',?)`, v); err != nil {
			httpErr(w, http.StatusInternalServerError, "unable to save app title")
			return
		}
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	})

	r.Post("/setup/finish", func(w http.ResponseWriter, r *http.Request) {
		usersCount, err := dbutil.Scalar[int](db, `SELECT COUNT(1) FROM users`)
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "users count failed")
			return
		}
		if usersCount > 0 {
			httpx.WriteError(w, http.StatusConflict, "SETUP_ALREADY_DONE", "setup already completed")
			return
		}

		tx, err := db.Begin()
		if err != nil {
			httpErr(w, http.StatusInternalServerError, "tx error")
			return
		}
		defer tx.Rollback()

		var req map[string]any
		if err := httpx.ReadJSON(r, &req); err != nil {
			httpErr(w, http.StatusBadRequest, "invalid json")
			return
		}

		if err := seedDefaultUsers(tx); err != nil {
			if isUniqueConstraintError(err) {
				httpx.WriteError(w, http.StatusConflict, "USERS_EXIST", "Users already exist")
				return
			}
			httpErr(w, http.StatusInternalServerError, "create users failed")
			return
		}

		if _, err := tx.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('setup_complete','1')`); err != nil {
			httpErr(w, http.StatusInternalServerError, "meta error")
			return
		}

		bootID, err := dbutil.ScalarOrZero[string](tx, `SELECT value FROM meta WHERE key = 'boot_id'`)
		if err != nil || bootID == "" {
			bootID = random.GenerateToken(12)
			if _, err := tx.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('boot_id',?)`, bootID); err != nil {
				httpErr(w, http.StatusInternalServerError, "meta boot_id")
				return
			}
		}

		if err := tx.Commit(); err != nil {
			httpErr(w, http.StatusInternalServerError, "commit failed")
			return
		}

		appTitleValue, _ := dbutil.ScalarOrZero[sql.NullString](db, `SELECT value FROM meta WHERE key = 'app_title'`)
		if err := documents.EnsureInitialWorkspaceContent(db, appTitleValue.String); err != nil {
			httpErr(w, http.StatusInternalServerError, "seed workspace failed")
			return
		}

		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"accounts": bootstrapSeededAccounts(),
		})
	})

	r.Post("/bootstrap/app-icon", func(w http.ResponseWriter, r *http.Request) {
		if !authorizeBootstrapMutation(w, r, db) {
			return
		}
		upload, ok := parseMultipartUploadOrRespond(w, r, 10<<20, uploadErrorMessages{
			invalidFormData: "invalid form data",
			missingUpload:   "missing file",
			invalidFile:     "invalid image file",
			serverError:     "server error",
		})
		if !ok {
			return
		}
		defer upload.File.Close()

		url, _, err := storeUploadedIcon(upload.File, upload.Sniff)
		if err != nil {
			if errors.Is(err, errUnsupportedImageType) {
				httpErr(w, http.StatusBadRequest, "unsupported image type")
				return
			}
			httpErr(w, http.StatusInternalServerError, "server error")
			return
		}
		if _, err := db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('app_icon',?)`, url); err != nil {
			httpErr(w, http.StatusInternalServerError, "unable to save icon")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"url": url})
	})

	r.Delete("/bootstrap/app-icon", func(w http.ResponseWriter, r *http.Request) {
		if !authorizeBootstrapMutation(w, r, db) {
			return
		}
		if _, err := db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES('app_icon','')`); err != nil {
			httpErr(w, http.StatusInternalServerError, "unable to clear icon")
			return
		}
		httpx.WriteJSON(w, http.StatusNoContent, nil)
	})
}

func authorizeBootstrapMutation(w http.ResponseWriter, r *http.Request, db *sql.DB) bool {
	usersCount, err := dbutil.Scalar[int](db, `SELECT COUNT(1) FROM users`)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "users count failed")
		return false
	}
	if usersCount == 0 {
		return true
	}
	u, err := auth.GetUserFromRequest(r, db)
	if err != nil || u == nil {
		httpx.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized")
		return false
	}
	if strings.EqualFold(u.Role, "Admin") || strings.EqualFold(u.Role, "Owner") {
		return true
	}
	httpx.WriteError(w, http.StatusForbidden, "FORBIDDEN", "forbidden")
	return false
}
