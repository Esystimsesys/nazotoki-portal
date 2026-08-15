#!/usr/bin/env bash
#
# Invoked by rain's `!Rain::S3 ... Run:` directive while packaging
# cloudformation/templates/apne1/nazotoki-cfn-lambda-api.yaml.
#
# rain executes this script with cwd = the template's directory
# (cloudformation/templates/apne1) and NO arguments (see rain
# cft/pkg/directives.go: `cmd := exec.Command(absPath); cmd.Dir = root`),
# so this script builds ALL backend functions (idempotent; esbuild is fast)
# and is safe to be invoked once per !Rain::S3 directive (once per function
# in this template).
#
# Backend build convention (docs/01-api-contract.md):
#   `npm run build` bundles each function with esbuild into
#   backend/functions/<name>/dist (single bundle, index.js/.mjs,
#   entry point index.handler).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/../../backend"

if [[ ! -d "${BACKEND_DIR}" ]]; then
  echo "ERROR: backend directory not found at ${BACKEND_DIR}" >&2
  exit 1
fi

cd "${BACKEND_DIR}"

# Install dependencies on first run (CI / fresh checkout)
if [[ ! -d node_modules ]]; then
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

npm run build
