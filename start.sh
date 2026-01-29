#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "Backend folder not found: $BACKEND_DIR" >&2
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR" ]]; then
  echo "Frontend folder not found: $FRONTEND_DIR" >&2
  exit 1
fi

if command -v code >/dev/null 2>&1; then
  echo "Opening project in VS Code..."
  (cd "$ROOT_DIR" && code .) >/dev/null 2>&1 || true
else
  echo "VS Code 'code' command not found (optional)."
fi

TERMINAL="gnome-terminal"
if ! command -v "$TERMINAL" >/dev/null 2>&1; then
  TERMINAL="x-terminal-emulator"
fi

echo "Starting backend + frontend..."

"$TERMINAL" -- bash -lc "
  set -e
  cd \"$BACKEND_DIR\"
  go mod tidy
  go run ./cmd/atlas
  echo
  echo 'Backend exited. Press Enter to close...'
  read
  bash
"

"$TERMINAL" -- bash -lc "
  set -e
  cd \"$FRONTEND_DIR\"
  npm install
  npm run dev
  echo
  echo 'Frontend exited. Press Enter to close...'
  read
  bash
"

echo "Done. Two terminal windows opened."
