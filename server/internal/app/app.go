package app

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"atlas/internal/api"
	"atlas/internal/contentpath"
	"atlas/internal/dbutil"
	"atlas/internal/documents"
	"atlas/internal/httpx"
	"atlas/internal/restore"
	"atlas/internal/storage"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	_ "modernc.org/sqlite"
)

func Run() {
	docsRoot := resolveDocsRoot()
	contentpath.SetRoots(docsRoot)
	if err := contentpath.EnsureRuntimeDirs(); err != nil {
		log.Fatalf("ensure runtime dirs: %v", err)
	}
	migrateContentToDocs()

	dbPath := contentpath.DatabasePath
	if os.Getenv("RESET_DB") == "1" {
		if err := os.Remove(dbPath); err == nil {
			log.Printf("removed existing database %s", dbPath)
		}
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if _, err := db.Exec(`PRAGMA journal_mode = WAL`); err != nil {
		log.Printf("set journal_mode=WAL: %v", err)
	}
	if _, err := db.Exec(`PRAGMA busy_timeout = 5000`); err != nil {
		log.Printf("set busy_timeout: %v", err)
	}

	if err := storage.InitDB(db); err != nil {
		log.Fatalf("init db: %v", err)
	}

	setupComplete, err := dbutil.ScalarOrZero[string](db, `SELECT value FROM meta WHERE key = 'setup_complete'`)
	if err != nil {
		setupComplete = ""
	}
	usersCount, err := dbutil.Scalar[int](db, `SELECT COUNT(1) FROM users`)
	if err != nil {
		usersCount = 0
	}
	docsCount, err := dbutil.Scalar[int](db, `SELECT COUNT(1) FROM documents`)
	if err != nil {
		docsCount = 0
	}

	diskDocCount := countDocsOnDisk()

	shouldSync := (setupComplete == "1" || usersCount > 0) || docsCount == 0 || diskDocCount > docsCount
	if shouldSync {
		log.Printf("Syncing content index...")
		if err := documents.SyncContentIndex(db); err != nil {
			log.Printf("sync content index: %v", err)
		} else {
			log.Printf("Content index synced successfully")
		}
	}
	monitorCtx, stopContentMonitor := context.WithCancel(context.Background())
	documents.StartContentIndexMonitor(monitorCtx, db)
	defer stopContentMonitor()

	r := chi.NewRouter()

	restoreCh := make(chan string, 1)
	apiRouter := chi.NewRouter()
	apiRouter.Use(middleware.Timeout(10 * time.Second))
	apiRouter.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	apiRouter.NotFound(func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteError(w, http.StatusNotFound, "NOT_FOUND", "not found")
	})
	apiRouter.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
	})
	api.RegisterRoutes(apiRouter, db, restoreCh)
	r.Mount("/api", apiRouter)

	uploadsDir := contentpath.UploadsRoot
	uploadsFS := http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadsDir)))
	r.Handle("/uploads/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		uploadsFS.ServeHTTP(w, r)
	}))

	distCandidates := []string{
		filepath.Clean("../client/dist"),
		filepath.Clean("./client/dist"),
		filepath.Clean("../frontend/dist"),
		filepath.Clean("./frontend/dist"),
	}
	dist := distCandidates[0]
	for _, candidate := range distCandidates {
		if _, err := os.Stat(candidate); err == nil {
			dist = candidate
			break
		}
	}
	staticFS := http.FileServer(http.Dir(dist))
	r.Handle("/assets/*", staticFS)

	r.HandleFunc("/*", func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodGet && req.Method != http.MethodHead {
			http.NotFound(w, req)
			return
		}

		p := req.URL.Path
		if strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/uploads/") {
			http.NotFound(w, req)
			return
		}

		fsPath := filepath.Join(dist, filepath.FromSlash(filepath.Clean(p)))
		if strings.HasSuffix(p, "/") {
			fsPath = filepath.Join(fsPath, "index.html")
		}
		if info, err := os.Stat(fsPath); err == nil && !info.IsDir() {
			staticFS.ServeHTTP(w, req)
			return
		}

		slugCandidate := strings.TrimPrefix(strings.TrimSuffix(p, "/"), "/")
		if slugCandidate != "" && !strings.HasPrefix(p, "/doc/") {
			if docPath, err := documents.DocPathFromSlug(slugCandidate); err == nil {
				if _, statErr := os.Stat(docPath); statErr == nil {
					parts := strings.Split(slugCandidate, "/")
					for i, part := range parts {
						parts[i] = url.PathEscape(part)
					}
					redirectURL := "/doc/" + strings.Join(parts, "/")
					http.Redirect(w, req, redirectURL, http.StatusMovedPermanently)
					return
				}
			}
		}

		index := filepath.Join(dist, "index.html")
		if _, err := os.Stat(index); err == nil {
			http.ServeFile(w, req, index)
			return
		}
		http.NotFound(w, req)
	})

	addr := ":8080"
	srv := &http.Server{Addr: addr, Handler: r, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second}
	log.Printf("listening on %s", addr)

	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen error: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	restorePath := ""
	select {
	case <-sigCh:
		log.Println("shutdown signal received")
	case restorePath = <-restoreCh:
		log.Printf("restore requested (%s)", restorePath)
	}
	signal.Stop(sigCh)
	stopContentMonitor()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("server shutdown: %v", err)
	}

	if err := db.Close(); err != nil {
		log.Printf("db close: %v", err)
	}

	if restorePath != "" {
		if err := restore.FinalizeRestore(restorePath); err != nil {
			log.Printf("restore finalize: %v", err)
		}
		os.Exit(0)
	}
}

func resolveDocsRoot() string {
	candidates := []string{
		filepath.Clean(filepath.Join("..", "docs")),
		filepath.Clean("docs"),
	}
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && info.IsDir() {
			return c
		}
	}
	return filepath.Clean("docs")
}

func migrateContentToDocs() {

	oldPaths := []string{
		filepath.Clean("content/docs"),
		filepath.Clean(filepath.Join("..", "content", "docs")),
	}
	for _, oldPath := range oldPaths {
		if info, err := os.Stat(oldPath); err != nil || !info.IsDir() {
			continue
		}

		_ = filepath.WalkDir(oldPath, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			rel, err := filepath.Rel(oldPath, path)
			if err != nil {
				return nil
			}
			dst := filepath.Join(contentpath.PublishedRoot, rel)
			if _, err := os.Stat(dst); err == nil {

				return nil
			}
			if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
				log.Printf("migration mkdir: %v", err)
				return nil
			}
			data, err := os.ReadFile(path)
			if err != nil {
				log.Printf("migration read: %v", err)
				return nil
			}
			if err := os.WriteFile(dst, data, 0o644); err != nil {
				log.Printf("migration write: %v", err)
			}
			return nil
		})
	}
}

func countDocsOnDisk() int {
	roots := []string{
		contentpath.PublishedRoot,
		contentpath.UnlistedRoot,
	}
	count := 0
	for _, root := range roots {
		if root == "" {
			continue
		}
		_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			if strings.HasSuffix(strings.ToLower(d.Name()), ".md") {
				count++
			}
			return nil
		})
	}
	return count
}
