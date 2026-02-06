#!/bin/bash
# 本番用Lambda CORS更新スクリプト（シンプル版）

REGION="ap-northeast-1"
CORS_ORIGIN="https://agent-key.pages.dev"

# DB接続情報
DB_HOST="ats-lite-db.cdiqayuosm2o.ap-northeast-1.rds.amazonaws.com"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="app_admin"
DB_PASSWORD="QgjoFpxFGJjxNwicxLUb"
JWT_SECRET="nFPWi7lPuMhQ2rlNW6Y28yTV+G2EeM1+2AVAebKwj4A="

FUNCTIONS=(
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

ENV_VARS="Variables={DB_HOST=$DB_HOST,DB_PORT=$DB_PORT,DB_NAME=$DB_NAME,DB_USER=$DB_USER,DB_PASSWORD=$DB_PASSWORD,JWT_SECRET=$JWT_SECRET,NODE_ENV=production,CORS_ALLOWED_ORIGINS=$CORS_ORIGIN}"

echo "CORS設定更新: $CORS_ORIGIN"

for FUNC in "${FUNCTIONS[@]}"; do
  echo -n "$FUNC: "
  aws lambda update-function-configuration \
    --function-name "$FUNC" \
    --environment "$ENV_VARS" \
    --region "$REGION" > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    echo "✅"
  else
    echo "❌"
  fi
  sleep 0.3
done

echo "完了！"
