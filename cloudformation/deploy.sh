#!/usr/bin/env bash
#
# nazotoki-portal - deploy all CloudFormation stacks in the order listed in
# templates.conf using rain.
#
# Cross-stack value passing: CloudFormation Outputs of already-deployed
# stacks are read with `aws cloudformation describe-stacks` and passed to
# dependent stacks as Parameters (no Export/ImportValue, same convention as
# ekiden-portal - keeps stack coupling inside this script so deletion is a
# plain reverse-order `rain rm`).
#
# Unlike ekiden-portal, there is no cognito<->cloudfront value cycle here
# (no Cognito stack at all - auth is a self-issued JWT, see
# docs/00-design.md), so this is a single, non-iterative pass: dynamodb ->
# lambda-api -> cloudfront.
#
# JWT_SECRET: required by the lambda-api stack (NoEcho parameter, shared
# HS256 secret for backend/shared/auth.ts). This script does NOT persist or
# recall a previously deployed secret (NoEcho parameters are masked in
# `describe-stacks` output, so there is nothing to read back). You must
# export JWT_SECRET yourself before running this script if you want the
# value to stay the same across redeploys - otherwise a fresh random secret
# is generated on every run, which invalidates any currently-issued JWTs
# (harmless: tokens expire in 24h anyway and no other data depends on this
# value) but is worth knowing about. See README.md.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CONF="templates.conf"

if [[ -z "${JWT_SECRET:-}" ]]; then
  JWT_SECRET="$(openssl rand -hex 32)"
  echo "==> JWT_SECRET not set in the environment; generated a new one for this deploy:"
  echo "    JWT_SECRET=${JWT_SECRET}"
  echo "    Export this same value before re-running deploy.sh if you want it to stay"
  echo "    stable across redeploys (otherwise every run rotates it - see README.md)."
fi

region_dir() {
  case "$1" in
    ap-northeast-1) echo "apne1" ;;
    *) echo "ERROR: unsupported region: $1" >&2; exit 1 ;;
  esac
}

# get_output <stack> <output-key> <region>  -> value ('' if stack/key absent)
get_output() {
  aws cloudformation describe-stacks \
    --stack-name "$1" --region "$3" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" \
    --output text 2>/dev/null || true
}

# build_params <stack> <region>  -> "K=V,K=V" for rain --params ('' if none)
build_params() {
  local stack="$1" region="$2"
  case "$stack" in
    nazotoki-cfn-lambda-api)
      local params=""
      params+="TeamsTableName=$(get_output nazotoki-cfn-dynamodb TeamsTableName "$region")"
      params+=",TeamsTableArn=$(get_output nazotoki-cfn-dynamodb TeamsTableArn "$region")"
      params+=",ProblemsTableName=$(get_output nazotoki-cfn-dynamodb ProblemsTableName "$region")"
      params+=",ProblemsTableArn=$(get_output nazotoki-cfn-dynamodb ProblemsTableArn "$region")"
      params+=",SubmissionsTableName=$(get_output nazotoki-cfn-dynamodb SubmissionsTableName "$region")"
      params+=",SubmissionsTableArn=$(get_output nazotoki-cfn-dynamodb SubmissionsTableArn "$region")"
      params+=",AdminsTableName=$(get_output nazotoki-cfn-dynamodb AdminsTableName "$region")"
      params+=",AdminsTableArn=$(get_output nazotoki-cfn-dynamodb AdminsTableArn "$region")"
      params+=",JwtSecret=${JWT_SECRET}"
      echo "$params"
      ;;
    nazotoki-cfn-cloudfront)
      echo "ApiDomainName=$(get_output nazotoki-cfn-lambda-api ApiDomainName "$region")"
      ;;
    *)
      echo ""
      ;;
  esac
}

deploy_stack() {
  local stack="$1" region="$2"
  local template="templates/$(region_dir "$region")/${stack}.yaml"
  if [[ ! -f "$template" ]]; then
    echo "ERROR: template not found: $template" >&2
    exit 1
  fi
  local params
  params="$(build_params "$stack" "$region")"
  echo "==> Deploying ${stack} (${region})"
  if [[ -n "$params" ]]; then
    rain deploy --yes -r "$region" --params "$params" "$template" "$stack"
  else
    rain deploy --yes -r "$region" "$template" "$stack"
  fi
}

grep -Ev '^\s*(#|$)' "$CONF" | while IFS=, read -r STACK REGION; do
  deploy_stack "$STACK" "$REGION"
done

echo "==> All stacks deployed."
echo "==> Next: build+upload the frontend and seed the first admin user - see README.md."
