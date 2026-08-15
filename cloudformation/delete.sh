#!/usr/bin/env bash
#
# nazotoki-portal - delete all CloudFormation stacks in REVERSE order of
# templates.conf using `rain rm`.
#
# The frontend S3 bucket must be empty before its stack (cloudfront) can be
# deleted, so this script empties it first (bucket name follows the fixed
# nazotoki-frontend-<accountId> convention). The rain packaging bucket
# (rain-artifacts-<accountId>-<region>) is left untouched - it is
# account-level, not part of these stacks.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CONF="templates.conf"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

empty_bucket() {
  local bucket="$1"
  if aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
    echo "==> Emptying s3://${bucket}"
    aws s3 rm "s3://${bucket}" --recursive
  fi
}

empty_bucket "nazotoki-frontend-${ACCOUNT_ID}"

# Reverse the list portably (tac on Linux, tail -r on macOS/BSD)
reverse_lines() {
  if command -v tac >/dev/null 2>&1; then tac; else tail -r; fi
}

# Reverse order of templates.conf
grep -Ev '^\s*(#|$)' "$CONF" | reverse_lines | while IFS=, read -r STACK REGION; do
  echo "==> Deleting ${STACK} (${REGION})"
  rain rm --yes -r "$REGION" "$STACK"
done

echo "==> All stacks deleted."
