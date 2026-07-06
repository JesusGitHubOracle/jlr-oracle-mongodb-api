#!/usr/bin/env bash
#usage: ./extract-db-indexes.sh <database_name> <mongodb_uri>
# DB="${1:-sample_geospatial}" # change to your database name
# URI="${2:-mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true&w=majority}" # change to your MongoDB URI

mkdir -p indexes

collections=$(mongosh "$URI/$DB" --quiet --eval \
'db.getCollectionNames().join(" ")')

for coll in $collections; do
    echo "Exporting indexes for $coll"

    mongosh "$URI/$DB" --quiet --eval \
    "EJSON.stringify(db.getCollection('$coll').getIndexes())" \
    > "indexes/${coll}_indexes.json"
done