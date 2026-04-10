#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

WORKSPACE_ROOT_OVERRIDE="${WORKSPACE_ROOT-}"
WORKSPACE_ROOT_HOST_OVERRIDE="${WORKSPACE_ROOT_HOST-}"

# shellcheck source=./load-env.sh
source "$ROOT_DIR/deploy/scripts/load-env.sh"

WORKSPACE_ROOT="${WORKSPACE_ROOT_HOST_OVERRIDE:-${WORKSPACE_ROOT_OVERRIDE:-${WORKSPACE_ROOT_HOST:-${WORKSPACE_ROOT:-$ROOT_DIR}}}}"

cd "$ROOT_DIR"
exec env WORKSPACE_ROOT="$WORKSPACE_ROOT" node ./deploy/scripts/create-local-user.mjs "$@"
