#!/usr/bin/env bash
#
# Run cfn-lint over all templates. cfn-lint cannot parse the rain-only
# "!Rain::S3" YAML tag, so each template is copied to a temp dir with that
# block replaced by a placeholder ZipFile-less Code property (only that
# block is altered; everything else is linted as-is).
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

for template in templates/apne1/*.yaml; do
  out="$TMP_DIR/$(basename "$template")"
  # Replace the 5-line rain directive block:
  #   Code: !Rain::S3
  #     Path: ...
  #     Run: ...
  #     BucketProperty: S3Bucket
  #     KeyProperty: S3Key
  # with a plain S3 Code object so cfn-lint can parse and validate the rest.
  perl -0pe 's/Code: !Rain::S3\n\s+Path: [^\n]+\n\s+Run: [^\n]+\n\s+BucketProperty: [^\n]+\n\s+KeyProperty: [^\n]+/Code:\n        S3Bucket: lint-placeholder\n        S3Key: lint-placeholder.zip/g' \
    "$template" > "$out"
done

cfn-lint "$TMP_DIR"/*.yaml
