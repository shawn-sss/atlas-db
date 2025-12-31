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
	"atlas/internal/documents"
	"atlas/internal/httpx"
	"atlas/internal/restore"
	"atlas/internal/storage"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	_ "modernc.org/sqlite"
)

func Run() {
	contentRoot := resolveContentRoot()
	contentpath.SetRoots(contentRoot)
	os.MkdirAll(contentpath.ContentRoot, 0o755)
	os.MkdirAll(contentpath.DocsRoot, 0o755)
	backfillContent(contentpath.ContentRoot)

	base := filepath.Clean("./data")
	os.MkdirAll(base, 0o755)
	os.MkdirAll(filepath.Join(base, "uploads"), 0o755)
	dbPath := filepath.Join(base, "app.db")
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

	var setupComplete string
	if err := db.QueryRow(`SELECT value FROM meta WHERE key = 'setup_complete'`).Scan(&setupComplete); err != nil {
		setupComplete = ""
	}
	var usersCount int
	if err := db.QueryRow(`SELECT COUNT(1) FROM users`).Scan(&usersCount); err != nil {
		usersCount = 0
	}
	if setupComplete == "1" || usersCount > 0 {
		if err := documents.SyncContentIndex(db); err != nil {
			log.Printf("sync content index: %v", err)
		}
	}

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

	uploadsDir := filepath.Clean("./data/uploads")
	os.MkdirAll(uploadsDir, 0o755)
	uploadsFS := http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadsDir)))
	r.Handle("/uploads/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		uploadsFS.ServeHTTP(w, r)
	}))

	dist := filepath.Clean("../frontend/dist")
	if _, err := os.Stat(dist); os.IsNotExist(err) {
		dist = filepath.Clean("./frontend/dist")
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

func resolveContentRoot() string {
	candidates := []string{
		filepath.Clean(filepath.Join("..", "content")),
		filepath.Clean("content"),
	}
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && info.IsDir() {
			return c
		}
	}
	return filepath.Clean("content")
}

func backfillContent(target string) {
	alts := []string{
		filepath.Clean("content"),
		filepath.Clean(filepath.Join("..", "content")),
	}
	for _, alt := range alts {
		alt = filepath.Clean(alt)
		if alt == target {
			continue
		}
		info, err := os.Stat(alt)
		if err != nil || !info.IsDir() {
			continue
		}
		_ = filepath.WalkDir(alt, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			rel, err := filepath.Rel(alt, path)
			if err != nil {
				return nil
			}
			relSlash := filepath.ToSlash(rel)
			if !strings.HasPrefix(relSlash, "docs/") {
				return nil
			}
			dst := filepath.Join(target, rel)
			if _, err := os.Stat(dst); err == nil {
				return nil
			}
			if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
				log.Printf("content copy mkdir: %v", err)
				return nil
			}
			data, err := os.ReadFile(path)
			if err != nil {
				log.Printf("content copy read: %v", err)
				return nil
			}
			if err := os.WriteFile(dst, data, 0o644); err != nil {
				log.Printf("content copy write: %v", err)
			}
			return nil
		})
	}
}
