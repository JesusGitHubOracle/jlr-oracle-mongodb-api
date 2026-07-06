#!/usr/bin/env bash
set -euo pipefail

# Back up MongoDB application databases.
#
# Mode 1: back up only the databases you explicitly list.
#
#   export MONGO_URI='mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true&w=majority'
#   export APP_DATABASES='appdb1 appdb2 appdb3'
#   ./backup-app-dbs.sh
#
# Mode 2: back up all databases except admin, local, and config.
#
#   export MONGO_URI='mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true&w=majority'
#   export BACKUP_MODE='all'
#   ./backup-app-dbs.sh
#
# Optional:
#
#   export BACKUP_DIR='./backups'


: "${MONGO_URI:?Please set MONGO_URI}"

BACKUP_MODE="${BACKUP_MODE:-list}"
EXCLUDED_DATABASES="${EXCLUDED_DATABASES:-admin local config}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TS="$(date +%Y%m%d_%H%M%S)"
RUN_DIR="${BACKUP_DIR}/${TS}"

mkdir -p "${RUN_DIR}"

list_non_system_databases() {
  mongosh "${MONGO_URI}" --quiet --eval "
    const excluded = new Set('${EXCLUDED_DATABASES}'.split(/\\s+/).filter(Boolean));
    const result = db.adminCommand({ listDatabases: 1, nameOnly: true });
    result.databases
      .map(database => database.name)
      .filter(name => !excluded.has(name))
      .sort()
      .join(' ');
  "
}

case "${BACKUP_MODE}" in
  list)
    : "${APP_DATABASES:?Please set APP_DATABASES to a space-separated list of databases, or set BACKUP_MODE=all}"
    DATABASES="${APP_DATABASES}"
    ;;
  all)
    DATABASES="$(list_non_system_databases)"
    ;;
  *)
    echo "Invalid BACKUP_MODE: ${BACKUP_MODE}" >&2
    echo "Use BACKUP_MODE=list with APP_DATABASES, or BACKUP_MODE=all." >&2
    exit 1
    ;;
esac

if [[ -z "${DATABASES// }" ]]; then
  echo "No databases selected for backup." >&2
  exit 1
fi

echo "Backup mode: ${BACKUP_MODE}"
echo "Databases: ${DATABASES}"
echo "Output directory: ${RUN_DIR}"

for db in ${DATABASES}; do
  echo "Backing up database: ${db}"
  mongodump \
    --uri "${MONGO_URI}" \
    --db "${db}" \
    --archive="${RUN_DIR}/${db}.archive.gz" \
    --gzip
done

echo "Backup complete."
echo "Files saved in: ${RUN_DIR}"
