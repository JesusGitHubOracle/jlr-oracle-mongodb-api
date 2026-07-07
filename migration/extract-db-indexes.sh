#!/usr/bin/env bash
set -u -o pipefail

usage() {
    cat <<'EOF'
Usage:
  ./extract-db-indexes.sh <database_name> <mongodb_uri>

Example:
  ./extract-db-indexes.sh sample_geospatial 'mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true&w=majority'
EOF
}

if [[ $# -ne 2 || -z "${1:-}" || -z "${2:-}" ]]; then
    usage >&2
    exit 1
fi

DB="$1"
URI="$2"

mkdir -p indexes

collection_infos=$(DB_NAME="$DB" mongosh "$URI" --quiet --eval \
'const d = db.getSiblingDB(process.env.DB_NAME);
for (const info of d.getCollectionInfos({}, { nameOnly: true })) {
  print(`${info.name}\t${info.type || "collection"}`);
}')

while IFS=$'\t' read -r coll type; do
    if [[ -z "${coll}" ]]; then
        continue
    fi

    if [[ "${type}" == "view" ]]; then
        echo "Skipping view $coll"
        continue
    fi

    if [[ "${type}" != "collection" ]]; then
        echo "Skipping $type $coll"
        continue
    fi

    echo "Exporting indexes for $coll"

    DB_NAME="$DB" COLL_NAME="$coll" mongosh "$URI" --quiet --eval \
    "EJSON.stringify(db.getSiblingDB(process.env.DB_NAME).getCollection(process.env.COLL_NAME).getIndexes())" \
    > "indexes/${coll}_indexes.json"
done <<< "$collection_infos"
