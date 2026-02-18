#!/usr/bin/env bash
set -euo pipefail

# Deploy production backup architecture:
# - RDS automated backups (PITR) retention: 14 days
# - Deletion protection: ON
# - AWS Backup: snapshot-style backups every 3 hours, retain 14 days, copy to Osaka (ap-northeast-3) retain 14 days
# - RDS cross-region automated backups replication to Osaka (PITR in DR), retain 14 days
#
# This script is intended to be idempotent-ish: it reuses existing named resources when present.
#
# Safe defaults are baked in for this repo/account. Override via env vars as needed.

PRIMARY_REGION="${PRIMARY_REGION:-ap-northeast-1}" # Tokyo
DR_REGION="${DR_REGION:-ap-northeast-3}"          # Osaka

DB_INSTANCE_ID="${DB_INSTANCE_ID:-ats-lite-db}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
FREQ_HOURS="${FREQ_HOURS:-3}"

BACKUP_VAULT_PRIMARY="${BACKUP_VAULT_PRIMARY:-agentkey-prod}"
BACKUP_VAULT_DR="${BACKUP_VAULT_DR:-agentkey-prod-dr}"
BACKUP_PLAN_NAME="${BACKUP_PLAN_NAME:-agentkey-prod-rds-${FREQ_HOURS}h-${RETENTION_DAYS}d}"
BACKUP_RULE_NAME="${BACKUP_RULE_NAME:-rds-${FREQ_HOURS}h}"
BACKUP_SELECTION_NAME="${BACKUP_SELECTION_NAME:-agentkey-prod-rds-selection}"

AWSBACKUP_ROLE_NAME="${AWSBACKUP_ROLE_NAME:-AWSBackupDefaultServiceRole}"

RDS_REPLICA_KMS_ALIAS="${RDS_REPLICA_KMS_ALIAS:-alias/agentkey-rds-replica}"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: missing command: $1" >&2; exit 1; }
}

require aws
require jq

log() { printf "%s\n" "$*" >&2; printf "\n" >&2; }

aws_json() {
  aws "$@" --output json
}

get_account_id() {
  aws sts get-caller-identity --output json | jq -r '.Account'
}

ensure_rds_retention_and_protection() {
  local region="$1"
  local instance_id="$2"
  local retention="$3"

  log "[RDS] Ensuring retention=${retention} and deletion-protection=ON for ${instance_id} (${region})"
  aws rds modify-db-instance \
    --region "${region}" \
    --db-instance-identifier "${instance_id}" \
    --backup-retention-period "${retention}" \
    --deletion-protection \
    --apply-immediately >/dev/null
}

get_db_instance_arn() {
  local region="$1"
  local instance_id="$2"
  aws rds describe-db-instances \
    --region "${region}" \
    --db-instance-identifier "${instance_id}" \
    --output json | jq -r '.DBInstances[0].DBInstanceArn'
}

ensure_backup_vault() {
  local region="$1"
  local vault_name="$2"

  if aws backup describe-backup-vault --region "${region}" --backup-vault-name "${vault_name}" >/dev/null 2>&1; then
    aws backup describe-backup-vault --region "${region}" --backup-vault-name "${vault_name}" --output json | jq -r '.BackupVaultArn'
    return 0
  fi

  log "[AWS Backup] Creating backup vault ${vault_name} (${region})"
  aws backup create-backup-vault --region "${region}" --backup-vault-name "${vault_name}" --output json | jq -r '.BackupVaultArn'
}

ensure_awsbackup_role() {
  local role_name="$1"

  if aws iam get-role --role-name "${role_name}" >/dev/null 2>&1; then
    aws iam get-role --role-name "${role_name}" --output json | jq -r '.Role.Arn'
    return 0
  fi

  log "[AWS Backup] Creating IAM role ${role_name}"
  local trust
  trust="$(mktemp)"
  cat >"${trust}" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "backup.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
JSON

  aws iam create-role --role-name "${role_name}" --assume-role-policy-document "file://${trust}" >/dev/null
  rm -f "${trust}"

  # Attach AWS managed policies required for RDS backup/restore actions.
  aws iam attach-role-policy --role-name "${role_name}" --policy-arn "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup" >/dev/null
  aws iam attach-role-policy --role-name "${role_name}" --policy-arn "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores" >/dev/null

  aws iam get-role --role-name "${role_name}" --output json | jq -r '.Role.Arn'
}

find_backup_plan_id_by_name() {
  local region="$1"
  local plan_name="$2"

  aws backup list-backup-plans --region "${region}" --output json \
    | jq -r --arg name "${plan_name}" '.BackupPlansList[]? | select(.BackupPlanName==$name) | .BackupPlanId' \
    | head -n 1
}

ensure_backup_plan() {
  local region="$1"
  local plan_name="$2"
  local rule_name="$3"
  local vault_name="$4"
  local dr_vault_arn="$5"
  local freq_hours="$6"
  local retention_days="$7"

  local plan_id
  plan_id="$(find_backup_plan_id_by_name "${region}" "${plan_name}")"
  if [[ -n "${plan_id}" && "${plan_id}" != "null" ]]; then
    log "[AWS Backup] Reusing backup plan ${plan_name} (${region}) id=${plan_id}"
    printf "%s\n" "${plan_id}"
    return 0
  fi

  log "[AWS Backup] Creating backup plan ${plan_name} (${region})"

  local tmp
  tmp="$(mktemp)"
  cat >"${tmp}" <<JSON
{
  "BackupPlanName": "${plan_name}",
  "Rules": [
    {
      "RuleName": "${rule_name}",
      "TargetBackupVaultName": "${vault_name}",
      "ScheduleExpression": "cron(0 */${freq_hours} * * ? *)",
      "StartWindowMinutes": 60,
      "CompletionWindowMinutes": 360,
      "Lifecycle": { "DeleteAfterDays": ${retention_days} },
      "CopyActions": [
        {
          "DestinationBackupVaultArn": "${dr_vault_arn}",
          "Lifecycle": { "DeleteAfterDays": ${retention_days} }
        }
      ]
    }
  ]
}
JSON

  local created
  created="$(aws backup create-backup-plan --region "${region}" --backup-plan "file://${tmp}" --output json)"
  rm -f "${tmp}"

  echo "${created}" | jq -r '.BackupPlanId'
}

backup_selection_exists() {
  local region="$1"
  local plan_id="$2"
  local selection_name="$3"

  aws backup list-backup-selections --region "${region}" --backup-plan-id "${plan_id}" --output json \
    | jq -r --arg name "${selection_name}" '.BackupSelectionsList[]? | select(.SelectionName==$name) | .SelectionId' \
    | head -n 1
}

ensure_backup_selection() {
  local region="$1"
  local plan_id="$2"
  local selection_name="$3"
  local role_arn="$4"
  local resource_arn="$5"

  local selection_id
  selection_id="$(backup_selection_exists "${region}" "${plan_id}" "${selection_name}")"
  if [[ -n "${selection_id}" && "${selection_id}" != "null" ]]; then
    log "[AWS Backup] Reusing backup selection ${selection_name} id=${selection_id}"
    return 0
  fi

  log "[AWS Backup] Creating backup selection ${selection_name} for resource ${resource_arn}"

  local tmp
  tmp="$(mktemp)"
  cat >"${tmp}" <<JSON
{
  "SelectionName": "${selection_name}",
  "IamRoleArn": "${role_arn}",
  "Resources": ["${resource_arn}"]
}
JSON

  aws backup create-backup-selection --region "${region}" --backup-plan-id "${plan_id}" --backup-selection "file://${tmp}" >/dev/null
  rm -f "${tmp}"
}

ensure_rds_replica_kms_key() {
  local region="$1"
  local alias_name="$2"

  local key_id
  key_id="$(aws kms list-aliases --region "${region}" --output json \
    | jq -r --arg a "${alias_name}" '.Aliases[]? | select(.AliasName==$a) | .TargetKeyId' \
    | head -n 1)"

  if [[ -n "${key_id}" && "${key_id}" != "null" ]]; then
    aws kms describe-key --region "${region}" --key-id "${key_id}" --output json | jq -r '.KeyMetadata.Arn'
    return 0
  fi

  log "[KMS] Creating key for RDS automated backup replication (${region}) alias=${alias_name}"
  local created
  created="$(aws kms create-key --region "${region}" --description "agentkey: RDS automated backup replication key" --output json)"
  key_id="$(echo "${created}" | jq -r '.KeyMetadata.KeyId')"

  aws kms create-alias --region "${region}" --alias-name "${alias_name}" --target-key-id "${key_id}" >/dev/null
  aws kms describe-key --region "${region}" --key-id "${key_id}" --output json | jq -r '.KeyMetadata.Arn'
}

ensure_rds_automated_backup_replication() {
  local source_region="$1"
  local dr_region="$2"
  local source_db_arn="$3"
  local instance_id="$4"
  local retention_days="$5"
  local dr_kms_key_arn="$6"

  # If already present in DR region, do nothing.
  local existing
  existing="$(aws rds describe-db-instance-automated-backups --region "${dr_region}" --output json \
    | jq -r --arg id "${instance_id}" '.DBInstanceAutomatedBackups[]? | select(.DBInstanceIdentifier==$id) | .DBInstanceAutomatedBackupsArn' \
    | head -n 1)"

  if [[ -n "${existing}" && "${existing}" != "null" ]]; then
    log "[RDS] Automated backup replication already enabled in ${dr_region} for ${instance_id}"
    return 0
  fi

  log "[RDS] Enabling cross-region automated backups replication to ${dr_region} (retention=${retention_days}d)"
  aws rds start-db-instance-automated-backups-replication \
    --region "${dr_region}" \
    --source-db-instance-arn "${source_db_arn}" \
    --backup-retention-period "${retention_days}" \
    --kms-key-id "${dr_kms_key_arn}" >/dev/null
}

start_test_backup_job() {
  local region="$1"
  local vault_name="$2"
  local resource_arn="$3"
  local role_arn="$4"

  log "[AWS Backup] Starting test backup job now (region=${region}, vault=${vault_name})"
  aws backup start-backup-job \
    --region "${region}" \
    --backup-vault-name "${vault_name}" \
    --resource-arn "${resource_arn}" \
    --iam-role-arn "${role_arn}" \
    --output json | jq -r '.BackupJobId'
}

main() {
  local account
  account="$(get_account_id)"
  log "Account: ${account}"
  log "Primary: ${PRIMARY_REGION}  DR: ${DR_REGION}"
  log "DB instance: ${DB_INSTANCE_ID}"

  local db_arn
  db_arn="$(get_db_instance_arn "${PRIMARY_REGION}" "${DB_INSTANCE_ID}")"
  log "DB ARN: ${db_arn}"

  # 1) RDS built-in backup retention + deletion protection
  ensure_rds_retention_and_protection "${PRIMARY_REGION}" "${DB_INSTANCE_ID}" "${RETENTION_DAYS}"

  # 2) AWS Backup scheduled snapshots + cross-region copy
  local role_arn
  role_arn="$(ensure_awsbackup_role "${AWSBACKUP_ROLE_NAME}")"
  log "AWS Backup role: ${role_arn}"

  local vault_arn_primary vault_arn_dr
  vault_arn_primary="$(ensure_backup_vault "${PRIMARY_REGION}" "${BACKUP_VAULT_PRIMARY}")"
  vault_arn_dr="$(ensure_backup_vault "${DR_REGION}" "${BACKUP_VAULT_DR}")"
  log "Vault primary: ${vault_arn_primary}"
  log "Vault DR:      ${vault_arn_dr}"

  local plan_id
  plan_id="$(ensure_backup_plan "${PRIMARY_REGION}" "${BACKUP_PLAN_NAME}" "${BACKUP_RULE_NAME}" "${BACKUP_VAULT_PRIMARY}" "${vault_arn_dr}" "${FREQ_HOURS}" "${RETENTION_DAYS}")"
  log "Backup plan id: ${plan_id}"
  if [[ -z "${plan_id}" || "${plan_id}" == "null" ]]; then
    echo "ERROR: failed to create/find backup plan id" >&2
    exit 1
  fi

  ensure_backup_selection "${PRIMARY_REGION}" "${plan_id}" "${BACKUP_SELECTION_NAME}" "${role_arn}" "${db_arn}"

  # 3) RDS cross-region automated backups replication (PITR in DR)
  local dr_kms_key_arn
  dr_kms_key_arn="$(ensure_rds_replica_kms_key "${DR_REGION}" "${RDS_REPLICA_KMS_ALIAS}")"
  log "DR KMS key: ${dr_kms_key_arn}"

  ensure_rds_automated_backup_replication "${PRIMARY_REGION}" "${DR_REGION}" "${db_arn}" "${DB_INSTANCE_ID}" "${RETENTION_DAYS}" "${dr_kms_key_arn}"

  # 4) Fire a one-off backup job to validate permissions and plumbing.
  local job_id
  job_id="$(start_test_backup_job "${PRIMARY_REGION}" "${BACKUP_VAULT_PRIMARY}" "${db_arn}" "${role_arn}")"
  log "Test backup job id: ${job_id}"

  log "Done."
}

main "$@"
