#!/usr/bin/env bash
set -euo pipefail

# Backup PostgreSQL regularly to avoid data-loss.
# - Prefers dumping from a running Docker Postgres container (no local pg tools needed).
# - Falls back to local pg_dump if available.
#
# Output (gitignored): .backups/db/<timestamp>__<label>.dump (+ .sha256)

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_BACKUP_DIR="${ROOT_DIR}/.backups/db"

BACKUP_DIR="${BACKUP_DIR:-$DEFAULT_BACKUP_DIR}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

# Optional: label shown in filename (dev/prod/etc)
LABEL="${BACKUP_LABEL:-agentkey}"

mkdir -p "${BACKUP_DIR}"

ts() { date +"%Y%m%d_%H%M%S"; }

have_cmd() { command -v "$1" >/dev/null 2>&1; }

sha256_file() {
  local file="$1"
  if have_cmd sha256sum; then
    sha256sum "${file}" | awk '{print $1}'
  else
    shasum -a 256 "${file}" | awk '{print $1}'
  fi
}

load_dotenv_if_present() {
  # Best-effort: only used when DATABASE_URL/DB_* are not already exported.
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
  # Return container name if running.
  # Prefer repo default: agentkey-db, then server/docker-compose: ai_dashboard_db
  local name
  for name in agentkey-db ai_dashboard_db; do
    if docker ps --format '{{.Names}}' | grep -Fx -- "${name}" >/dev/null 2>&1; then
      echo "${name}"
      return 0
    fi
  done
  return 1
}

dump_via_docker_container() {
  local container="$1"

  # Try to read standard env vars from the container itself (POSTGRES_*)
  local pg_user pg_db pg_pass
  pg_user="$(docker exec "${container}" sh -lc 'printf "%s" "${POSTGRES_USER:-}"' || true)"
  pg_db="$(docker exec "${container}" sh -lc 'printf "%s" "${POSTGRES_DB:-}"' || true)"
  pg_pass="$(docker exec "${container}" sh -lc 'printf "%s" "${POSTGRES_PASSWORD:-}"' || true)"

  if [[ -z "${pg_user}" || -z "${pg_db}" ]]; then
    echo "ERROR: Could not detect POSTGRES_USER/POSTGRES_DB from container ${container}." >&2
    echo "Hint: export DATABASE_URL locally and re-run (fallback path)." >&2
    return 1
  fi

  local outfile="${BACKUP_DIR}/$(ts)__${LABEL}__${container}__${pg_db}.dump"
  local sha_file="${outfile}.sha256"

  echo "Backing up via Docker container: ${container} (db=${pg_db}, user=${pg_user})"

  # --create lets restore recreate the DB (pg_restore --create expects connecting to another db, e.g. postgres)
  if [[ -n "${pg_pass}" ]]; then
    docker exec -e PGPASSWORD="${pg_pass}" "${container}" \
      pg_dump -U "${pg_user}" -d "${pg_db}" -Fc --create --no-owner --no-acl >"${outfile}"
  else
    docker exec "${container}" \
      pg_dump -U "${pg_user}" -d "${pg_db}" -Fc --create --no-owner --no-acl >"${outfile}"
  fi

  local sum
  sum="$(sha256_file "${outfile}")"
  printf "%s  %s\n" "${sum}" "$(basename -- "${outfile}")" >"${sha_file}"

  echo "Wrote: ${outfile}"
  echo "Wrote: ${sha_file}"
}

dump_via_local_pg_dump() {
  load_dotenv_if_present

  if ! have_cmd pg_dump; then
    echo "ERROR: pg_dump not found and no Docker container available." >&2
    echo "Fix options:" >&2
    echo "  - Start Docker and run your postgres container, then re-run this script." >&2
    echo "  - Or install PostgreSQL client tools (pg_dump/pg_restore) locally." >&2
    return 1
  fi

  local outfile="${BACKUP_DIR}/$(ts)__${LABEL}__local.dump"
  local sha_file="${outfile}.sha256"

  if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "Backing up via local pg_dump (DATABASE_URL is set; details hidden)"
    pg_dump --dbname="${DATABASE_URL}" -Fc --create --no-owner --no-acl >"${outfile}"
  else
    # Allow the DB_* style env vars (commonly used for Lambda) as a fallback.
    # Note: This avoids URL-encoding pitfalls in DATABASE_URL.
    if [[ -z "${DB_HOST:-}" || -z "${DB_NAME:-}" || -z "${DB_USER:-}" ]]; then
      echo "ERROR: Neither DATABASE_URL nor (DB_HOST/DB_NAME/DB_USER) are set." >&2
      return 1
    fi
    echo "Backing up via local pg_dump (DB_* env vars; details hidden)"
    PGHOST="${DB_HOST}" \
    PGPORT="${DB_PORT:-5432}" \
    PGUSER="${DB_USER}" \
    PGPASSWORD="${DB_PASSWORD:-}" \
    PGDATABASE="${DB_NAME}" \
      pg_dump -Fc --create --no-owner --no-acl >"${outfile}"
  fi

  local sum
  sum="$(sha256_file "${outfile}")"
  printf "%s  %s\n" "${sum}" "$(basename -- "${outfile}")" >"${sha_file}"

  echo "Wrote: ${outfile}"
  echo "Wrote: ${sha_file}"
}

prune_old_backups() {
  if [[ "${KEEP_DAYS}" =~ ^[0-9]+$ ]] && [[ "${KEEP_DAYS}" -gt 0 ]]; then
    find "${BACKUP_DIR}" -type f -name "*.dump" -mtime "+${KEEP_DAYS}" -print -delete 2>/dev/null || true
    find "${BACKUP_DIR}" -type f -name "*.sha256" -mtime "+${KEEP_DAYS}" -print -delete 2>/dev/null || true
  fi
}

main() {
  if docker_ready; then
    if container="$(pick_pg_container)"; then
      dump_via_docker_container "${container}"
      prune_old_backups
      exit 0
    fi
  fi

dump_via_local_pg_dump
prune_old_backups
}

main "$@"
