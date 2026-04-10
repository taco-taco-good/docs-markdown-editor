#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

HOST_OVERRIDE="${HOST-}"
PORT_OVERRIDE="${PORT-}"
WORKSPACE_ROOT_OVERRIDE="${WORKSPACE_ROOT-}"
WORKSPACE_ROOT_HOST_OVERRIDE="${WORKSPACE_ROOT_HOST-}"

# shellcheck source=./load-env.sh
source "$ROOT_DIR/deploy/scripts/load-env.sh"

HOST="${HOST_OVERRIDE:-${HOST:-0.0.0.0}}"
PORT="${PORT_OVERRIDE:-${PORT:-3001}}"
WORKSPACE_ROOT="${WORKSPACE_ROOT_HOST_OVERRIDE:-${WORKSPACE_ROOT_OVERRIDE:-${WORKSPACE_ROOT_HOST:-${WORKSPACE_ROOT:-$ROOT_DIR}}}}"

cd "$ROOT_DIR"
exec env HOST="$HOST" PORT="$PORT" WORKSPACE_ROOT="$WORKSPACE_ROOT" \
  node packages/server/src/http/node-server.ts
