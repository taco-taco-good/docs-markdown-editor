#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=./load-env.sh
source "$ROOT_DIR/deploy/scripts/load-env.sh"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3001}"
WEB_PORT="${WEB_PORT:-5173}"
API_TARGET="${VITE_API_TARGET:-http://127.0.0.1:$PORT}"

cd "$ROOT_DIR/packages/web"
exec env VITE_API_TARGET="$API_TARGET" npm run dev -- --host "$HOST" --port "$WEB_PORT"

