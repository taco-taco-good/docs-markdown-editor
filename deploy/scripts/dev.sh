#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

HOST_OVERRIDE="${HOST-}"
PUBLIC_HOST_OVERRIDE="${PUBLIC_HOST-}"
PORT_OVERRIDE="${PORT-}"
WEB_PORT_OVERRIDE="${WEB_PORT-}"
SERVER_LOG_OVERRIDE="${SERVER_LOG-}"
WEB_LOG_OVERRIDE="${WEB_LOG-}"

# shellcheck source=./load-env.sh
source "$ROOT_DIR/deploy/scripts/load-env.sh"

HOST="${HOST_OVERRIDE:-${HOST:-0.0.0.0}}"
PUBLIC_HOST="${PUBLIC_HOST_OVERRIDE:-${PUBLIC_HOST:-localhost}}"
PORT="${PORT_OVERRIDE:-${PORT:-3001}}"
WEB_PORT="${WEB_PORT_OVERRIDE:-${WEB_PORT:-5173}}"
SERVER_LOG="${SERVER_LOG_OVERRIDE:-${SERVER_LOG:-$ROOT_DIR/server.log}}"
WEB_LOG="${WEB_LOG_OVERRIDE:-${WEB_LOG:-$ROOT_DIR/packages/web/web.log}}"

server_pid=""
web_pid=""

cleanup() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
  fi
  if [[ -n "$web_pid" ]] && kill -0 "$web_pid" 2>/dev/null; then
    kill "$web_pid" 2>/dev/null || true
  fi
  wait "$server_pid" 2>/dev/null || true
  wait "$web_pid" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

mkdir -p "$(dirname "$SERVER_LOG")" "$(dirname "$WEB_LOG")"

bash "$ROOT_DIR/deploy/scripts/dev-server.sh" >"$SERVER_LOG" 2>&1 &
server_pid=$!

bash "$ROOT_DIR/deploy/scripts/dev-web.sh" >"$WEB_LOG" 2>&1 &
web_pid=$!

printf "server: http://%s:%s (listening on %s)\n" "$PUBLIC_HOST" "$PORT" "$HOST"
printf "web:    http://%s:%s (listening on %s)\n" "$PUBLIC_HOST" "$WEB_PORT" "$HOST"
printf "logs:   %s\n" "$SERVER_LOG"
printf "        %s\n" "$WEB_LOG"

while kill -0 "$server_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 1
done

if ! kill -0 "$server_pid" 2>/dev/null; then
  wait "$server_pid"
fi

wait "$web_pid"
