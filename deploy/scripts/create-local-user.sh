#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=./load-env.sh
source "$ROOT_DIR/deploy/scripts/load-env.sh"

WORKSPACE_ROOT="${WORKSPACE_ROOT_HOST:-${WORKSPACE_ROOT:-$ROOT_DIR}}"

cd "$ROOT_DIR"
exec env WORKSPACE_ROOT="$WORKSPACE_ROOT" node ./deploy/scripts/create-local-user.mjs "$@"

