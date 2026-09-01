#!/usr/bin/env bash
# Boot God's Eye View locally and open it in a browser.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-4173}"
HOST="${HOST:-localhost}"
URL="http://localhost:${PORT}/"

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found"
  exit 1
fi

open_browser() {
  local url="$1"
  if command -v wslview >/dev/null 2>&1; then
    wslview "$url" >/dev/null 2>&1 && return 0
  fi
  if command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$url" >/dev/null 2>&1 && return 0
  fi
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 && return 0
  fi
  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 && return 0
  fi
  echo "Open ${url} in your browser."
  return 1
}

http_ready() {
  command -v curl >/dev/null 2>&1 || return 1
  curl -sf -o /dev/null --connect-timeout 1 --max-time 1 "$URL"
}

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install
fi

if http_ready; then
  echo "Already running at ${URL}"
  open_browser "$URL" || true
  exit 0
fi

echo "Starting God's Eye View at ${URL}"

(
  for _ in $(seq 1 80); do
    if http_ready; then
      open_browser "$URL" || true
      exit 0
    fi
    sleep 0.25
  done
  echo "Server started, but ${URL} did not respond in time. Open it manually."
) &
OPENER_PID=$!

cleanup() {
  kill "$OPENER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

npm run dev -- --host "${HOST}" --port "${PORT}"
