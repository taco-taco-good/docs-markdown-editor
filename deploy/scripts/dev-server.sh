#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=./load-env.sh
source "$ROOT_DIR/deploy/scripts/load-env.sh"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3001}"
WORKSPACE_ROOT="${WORKSPACE_ROOT_HOST:-${WORKSPACE_ROOT:-$ROOT_DIR}}"

cd "$ROOT_DIR"
exec env HOST="$HOST" PORT="$PORT" WORKSPACE_ROOT="$WORKSPACE_ROOT" \
  node packages/server/src/http/node-server.ts

