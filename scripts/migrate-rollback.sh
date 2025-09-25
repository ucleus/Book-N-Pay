#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_DIR="supabase/migrations"
LATEST_DOWN_FILE="$(ls "${MIGRATIONS_DIR}"/*_*.down.sql 2>/dev/null | sort | tail -n 1 || true)"
TARGET_FILE="${1:-${LATEST_DOWN_FILE}}"

if [[ -z "${TARGET_FILE}" ]]; then
  echo "No rollback file found. Supply a file path or create a *.down.sql migration." >&2
  exit 1
fi

if [[ ! -f "${TARGET_FILE}" ]]; then
  echo "Rollback file ${TARGET_FILE} does not exist" >&2
  exit 1
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL env var is required to run rollbacks." >&2
  exit 1
fi

psql "${SUPABASE_DB_URL}" -f "${TARGET_FILE}"

echo "Executed rollback from ${TARGET_FILE}" >&2
