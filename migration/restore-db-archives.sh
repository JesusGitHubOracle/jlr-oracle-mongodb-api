#!/usr/bin/env bash
set -u -o pipefail

# restore-db-archives.sh
#
# Restores every *.archive.gz file in a directory.
# Writes a log file and a summary table.
# Continues to the next database even if one restore fails.
#
# Usage:
#   export TARGET_URI='mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true&w=majority'
TARGET_URI='mongodb://admin:DB23ee%23%23%2312345@G5E60EBADF0D95A-AJD.adb.eu-frankfurt-1.oraclecloudapps.com:27017/admin?authMechanism=PLAIN&authSource=$external&ssl=true&retryWrites=false&loadBalanced=true'
#   ./restore-db-archives.sh /path/to/backups
#
# Optional:
DROP_EXISTING=1    # drop collections before restoring each archive
SKIP_INDEXES=1     # skip index restore if index creation is failing
#   export SKIP_SYSTEM_DBS=1  # skip admin/local/config archives by filename
#   export LOG_DIR=./restore-logs

: "${TARGET_URI:?Please set TARGET_URI}"

BACKUP_DIR="${1:-}"
DROP_EXISTING="${DROP_EXISTING:-0}"
SKIP_INDEXES="${SKIP_INDEXES:-0}"
SKIP_SYSTEM_DBS="${SKIP_SYSTEM_DBS:-1}"
LOG_DIR="${LOG_DIR:-./restore-logs}"

if [[ -z "${BACKUP_DIR}" ]]; then
  echo "Usage: $0 /path/to/backups" >&2
  exit 1
fi

if [[ ! -d "${BACKUP_DIR}" ]]; then
  echo "Directory not found: ${BACKUP_DIR}" >&2
  exit 1
fi

mkdir -p "${LOG_DIR}"

RUN_ID="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${LOG_DIR}/restore_${RUN_ID}.log"
SUMMARY_FILE="${LOG_DIR}/restore_${RUN_ID}_summary.md"

# Send everything to the log file and to the terminal.
exec > >(tee -a "${LOG_FILE}") 2>&1

shopt -s nullglob
archives=( "${BACKUP_DIR}"/*.archive.gz "${BACKUP_DIR}"/*.gz )

if [[ ${#archives[@]} -eq 0 ]]; then
  echo "No archive files found in: ${BACKUP_DIR}"
  exit 1
fi

count_documents() {
  local db_name="$1"

  DB_NAME="${db_name}" mongosh "${TARGET_URI}" --quiet --eval '
    const dbName = process.env.DB_NAME;
    const d = db.getSiblingDB(dbName);
    let total = 0;

    for (const coll of d.getCollectionNames()) {
      try {
        total += d.getCollection(coll).countDocuments({});
      } catch (e) {
        // Ignore count errors for individual collections and keep going.
      }
    }

    print(total);
  ' 2>/dev/null | tail -n 1
}

printf "# MongoDB restore summary\n\n" > "${SUMMARY_FILE}"
printf "Log file: \`%s\`\n\n" "${LOG_FILE}" >> "${SUMMARY_FILE}"
printf "| Database | Documents | Restore errors | Status |\n" >> "${SUMMARY_FILE}"
printf "|---|---:|---|---|\n" >> "${SUMMARY_FILE}"

overall_failed=0

for archive_path in "${archives[@]}"; do
  filename="$(basename "${archive_path}")"
  db_name="${filename%.archive.gz}"
  db_name="${db_name%.gz}"

  if [[ "${SKIP_SYSTEM_DBS}" == "1" ]]; then
    case "${db_name}" in
      admin|local|config)
        echo "Skipping system database archive: ${filename}"
        printf "| %s | %s | %s | %s |\n" "${db_name}" "-" "Skipped" "SKIPPED" >> "${SUMMARY_FILE}"
        continue
        ;;
    esac
  fi

  echo
  echo "Restoring: ${filename} -> ${db_name}"

  restore_cmd=(
    mongorestore
    --uri "${TARGET_URI}"
    --archive="${archive_path}"
    --gzip
    --nsInclude="${db_name}.*"
  )

  if [[ "${DROP_EXISTING}" == "1" ]]; then
    restore_cmd+=(--drop)
  fi

  if [[ "${SKIP_INDEXES}" == "1" ]]; then
    restore_cmd+=(--noIndexRestore)
  fi

  restore_ok=1
  if "${restore_cmd[@]}"; then
    restore_ok=0
    echo "Restore succeeded for ${db_name}"
  else
    echo "Restore failed for ${db_name}"
    overall_failed=1
  fi

  docs="$(count_documents "${db_name}")"
  if [[ -z "${docs}" ]]; then
    docs="unknown"
  fi

  if [[ "${restore_ok}" -eq 0 ]]; then
    error_flag="No"
    status="OK"
  else
    error_flag="Yes"
    status="FAILED"
  fi

  printf "| %s | %s | %s | %s |\n" "${db_name}" "${docs}" "${error_flag}" "${status}" >> "${SUMMARY_FILE}"
done

echo
echo "Restore run complete."
echo "Log file: ${LOG_FILE}"
echo "Summary file: ${SUMMARY_FILE}"

echo
cat "${SUMMARY_FILE}"

if [[ "${overall_failed}" -eq 1 ]]; then
  exit 1
fi
