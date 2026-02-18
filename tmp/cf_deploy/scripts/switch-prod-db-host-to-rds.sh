#!/usr/bin/env bash
set -euo pipefail

# Rollback: Update prod Lambda DB_HOST back to direct RDS endpoint, preserving all other env vars.
#
# Requirements:
# - aws cli configured for account 195275648846
# - jq installed
#
# Usage:
#   scripts/switch-prod-db-host-to-rds.sh

REGION="ap-northeast-1"
RDS_ENDPOINT="ats-lite-db.cdiqayuosm2o.ap-northeast-1.rds.amazonaws.com"

FUNCTIONS=(
  "ats-api-prod-auth-login"
  "ats-api-prod-auth-me"
  "ats-api-prod-candidates-detail"
  "ats-api-prod-candidates-list"
  "ats-api-prod-clients-create"
  "ats-api-prod-goal-settings"
  "ats-api-prod-kpi-ads"
  "ats-api-prod-kpi-ads-detail"
  "ats-api-prod-kpi-clients"
  "ats-api-prod-kpi-clients-edit"
  "ats-api-prod-kpi-targets"
  "ats-api-prod-kpi-teleapo"
  "ats-api-prod-kpi-yield"
  "ats-api-prod-kpi-yield-daily"
  "ats-api-prod-kpi-yield-personal"
  "ats-api-prod-members"
  "ats-api-prod-ms-targets"
  "ats-api-prod-mypage"
  "ats-api-prod-settings-screening-rules"
  "ats-api-prod-teleapo-candidate-contact"
  "ats-api-prod-teleapo-log-create"
  "ats-api-prod-teleapo-logs"
)

echo "Region: ${REGION}"
echo "RDS endpoint: ${RDS_ENDPOINT}"
echo ""

for fn in "${FUNCTIONS[@]}"; do
  echo "Updating: ${fn}"

  env_payload="$(
    aws lambda get-function-configuration \
      --function-name "${fn}" \
      --region "${REGION}" \
      --query 'Environment.Variables' \
      --output json \
      --no-cli-pager \
    | jq -c --arg host "${RDS_ENDPOINT}" '{Variables: ((. // {}) + {DB_HOST: $host})}'
  )"

  aws lambda update-function-configuration \
    --function-name "${fn}" \
    --region "${REGION}" \
    --environment "${env_payload}" \
    --no-cli-pager >/dev/null

  echo "  OK"
done

echo ""
echo "Done."

