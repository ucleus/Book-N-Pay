#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL env var is required. It should be a Postgres connection string." >&2
  exit 1
fi

TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"
OUTPUT_PATH="${1:-backups/book-n-pay-${TIMESTAMP}.sql}"

mkdir -p "$(dirname "${OUTPUT_PATH}")"

pg_dump "${SUPABASE_DB_URL}" \
  --no-owner \
  --no-privileges \
  --format=plain \
  --file="${OUTPUT_PATH}"

echo "Database backup written to ${OUTPUT_PATH}" >&2
