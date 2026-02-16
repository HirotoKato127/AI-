#!/usr/bin/env bash
set -euo pipefail

# Restore a PostgreSQL backup created by scripts/backup/db_backup.sh
#
# Usage:
#   scripts/backup/db_restore.sh /path/to/file.dump
#
# Notes:
# - This will execute destructive operations (DROP/CREATE) because backups are made with --create.
# - Prefer restoring into a local/dev database.

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

have_cmd() { command -v "$1" >/dev/null 2>&1; }

load_dotenv_if_present() {
  # shellcheck disable=SC1091
  if [[ -z "${DATABASE_URL:-}" && -f "${ROOT_DIR}/.env" ]]; then
    set -a
    source "${ROOT_DIR}/.env" || true
    set +a
  fi
}

docker_ready() {
  have_cmd docker || return 1
  docker info >/dev/null 2>&1 || return 1
  return 0
}

pick_pg_container() {
  local name
  for name in agentkey-db ai_dashboard_db; do
    if docker ps --format '{{.Names}}' | grep -Fx -- "${name}" >/dev/null 2>&1; then
      echo "${name}"
      return 0
    fi
  done
  return 1
}

restore_via_docker_container() {
  local container="$1"
  local dump_file="$2"

  local pg_user pg_pass
  pg_user="$(docker exec "${container}" sh -lc 'printf "%s" "${POSTGRES_USER:-}"' || true)"
  pg_pass="$(docker exec "${container}" sh -lc 'printf "%s" "${POSTGRES_PASSWORD:-}"' || true)"

  if [[ -z "${pg_user}" ]]; then
    echo "ERROR: Could not detect POSTGRES_USER from container ${container}." >&2
    return 1
  fi

  echo "Restoring via Docker container: ${container} (user=${pg_user})"

  # Copy into container to avoid pg_restore stdin ambiguity across versions.
  local remote="/tmp/agentkey_restore.dump"
  docker cp "${dump_file}" "${container}:${remote}"

  if [[ -n "${pg_pass}" ]]; then
    docker exec -e PGPASSWORD="${pg_pass}" "${container}" \
      pg_restore -U "${pg_user}" -d postgres --clean --if-exists --no-owner --no-acl --create "${remote}"
  else
    docker exec "${container}" \
      pg_restore -U "${pg_user}" -d postgres --clean --if-exists --no-owner --no-acl --create "${remote}"
  fi

  docker exec "${container}" rm -f "${remote}" || true
}

restore_via_local_pg_restore() {
  local dump_file="$1"

  load_dotenv_if_present

  if ! have_cmd pg_restore; then
    echo "ERROR: pg_restore not found and no Docker container available." >&2
    echo "Fix options:" >&2
    echo "  - Start Docker and run your postgres container, then re-run." >&2
    echo "  - Or install PostgreSQL client tools (pg_dump/pg_restore) locally." >&2
    return 1
  fi

  if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "Restoring via local pg_restore (DATABASE_URL is set; details hidden)"
    # Need to connect to a DB that exists to run --create (usually postgres).
    pg_restore --dbname="${DATABASE_URL}" --clean --if-exists --no-owner --no-acl --create "${dump_file}"
    return 0
  fi

  if [[ -z "${DB_HOST:-}" || -z "${DB_USER:-}" ]]; then
    echo "ERROR: DATABASE_URL not set and DB_HOST/DB_USER missing." >&2
    return 1
  fi

  echo "Restoring via local pg_restore (DB_* env vars; details hidden)"
  PGHOST="${DB_HOST}" \
  PGPORT="${DB_PORT:-5432}" \
  PGUSER="${DB_USER}" \
  PGPASSWORD="${DB_PASSWORD:-}" \
    pg_restore -d postgres --clean --if-exists --no-owner --no-acl --create "${dump_file}"
}

main() {
  if [[ $# -ne 1 ]]; then
    echo "Usage: $0 /path/to/file.dump" >&2
    exit 2
  fi

  local dump_file="$1"
  if [[ ! -f "${dump_file}" ]]; then
    echo "ERROR: dump file not found: ${dump_file}" >&2
    exit 2
  fi

  if docker_ready; then
    if container="$(pick_pg_container)"; then
      restore_via_docker_container "${container}" "${dump_file}"
      exit 0
    fi
  fi

  restore_via_local_pg_restore "${dump_file}"
}

main "$@"
