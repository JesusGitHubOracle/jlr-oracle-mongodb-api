#!/usr/bin/env bash

# Report logical and allocated physical storage for one Atlas collection.
# Requires mongosh and a URI for a user with the collStats privilege.

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
:q!
="${MONGO_URI:-}"
DATABASE_NAME=""
COLLECTION_NAME=""

usage() {
  cat <<USAGE
Usage:
  $SCRIPT_NAME [--uri URI] [--database DATABASE] [--collection COLLECTION]

Supply MONGO_URI or --uri. Any missing database or collection value is requested
interactively. The collection can also be supplied as DATABASE.COLLECTION.

Examples:
  export MONGO_URI='mongodb+srv://USER:PASSWORD@cluster.example.mongodb.net/'
  ./$SCRIPT_NAME
  ./$SCRIPT_NAME --collection inventory.products
USAGE
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --uri)
      [ "$#" -ge 2 ] || die '--uri requires a value'
      MONGO_URI="$2"
      shift 2
      ;;
    --uri=*) MONGO_URI="${1#*=}"; shift ;;
    --database)
      [ "$#" -ge 2 ] || die '--database requires a value'
      DATABASE_NAME="$2"
      shift 2
      ;;
    --database=*) DATABASE_NAME="${1#*=}"; shift ;;
    --collection)
      [ "$#" -ge 2 ] || die '--collection requires a value'
      COLLECTION_NAME="$2"
      shift 2
      ;;
    --collection=*) COLLECTION_NAME="${1#*=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1. Run $SCRIPT_NAME --help for usage." ;;
  esac
done

command -v mongosh >/dev/null 2>&1 || die 'mongosh is required but was not found in PATH.'
[ -n "$MONGO_URI" ] || die 'Provide an Atlas URI with --uri or MONGO_URI.'

if [ -z "$DATABASE_NAME" ]; then
  read -r -p 'Atlas database name: ' DATABASE_NAME
fi
if [ -z "$COLLECTION_NAME" ]; then
  read -r -p 'Collection name (or database.collection): ' COLLECTION_NAME
fi

if [ -z "$DATABASE_NAME" ] && [[ "$COLLECTION_NAME" == *.* ]]; then
  DATABASE_NAME="${COLLECTION_NAME%%.*}"
  COLLECTION_NAME="${COLLECTION_NAME#*.}"
fi

[ -n "$DATABASE_NAME" ] || die 'A database name is required.'
[ -n "$COLLECTION_NAME" ] || die 'A collection name is required.'

MONGO_URI="$MONGO_URI" DATABASE_NAME="$DATABASE_NAME" COLLECTION_NAME="$COLLECTION_NAME" mongosh \
  --nodb \
  --quiet \
  --eval '
const uri = process.env.MONGO_URI;
const databaseName = process.env.DATABASE_NAME;
const collectionName = process.env.COLLECTION_NAME;

function toBigInt(value) {
  return BigInt(value === undefined || value === null ? 0 : value.toString());
}

function formatBytes(bytes) {
  const units = [
    ["EiB", 1024n ** 6n], ["PiB", 1024n ** 5n], ["TiB", 1024n ** 4n],
    ["GiB", 1024n ** 3n], ["MiB", 1024n ** 2n], ["KiB", 1024n],
  ];
  if (bytes < 1024n) return `${bytes} B`;
  for (const [unit, divisor] of units) {
    if (bytes >= divisor) {
      const hundredths = (bytes * 100n + divisor / 2n) / divisor;
      return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")} ${unit}`;
    }
  }
}

function printTable(headers, rows) {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)));
  const line = (row) => row.map((cell, index) => (index === 0 ? cell.padEnd(widths[index]) : cell.padStart(widths[index]))).join("  ");
  print(line(headers));
  print(widths.map((width) => "-".repeat(width)).join("  "));
  rows.forEach((row) => print(line(row)));
}

const connection = new Mongo(uri);
const database = connection.getDB(databaseName);
const collections = database.getCollectionInfos({ name: collectionName });
if (collections.length === 0) {
  throw new Error(`Collection not found: ${databaseName}.${collectionName}`);
}

// $collStats returns one document for each shard for a sharded collection.
const shardStats = database.getCollection(collectionName)
  .aggregate([{ $collStats: { storageStats: {} } }])
  .toArray();

let logicalSize = 0n;
let collectionStorage = 0n;
let indexStorage = 0n;
const shardRows = shardStats.map((entry) => {
  const stats = entry.storageStats || {};
  const logical = toBigInt(stats.size);
  const collection = toBigInt(stats.storageSize);
  const indexes = toBigInt(stats.totalIndexSize);
  const total = collection + indexes;
  logicalSize += logical;
  collectionStorage += collection;
  indexStorage += indexes;
  return [entry.host || "primary", formatBytes(logical), formatBytes(collection), formatBytes(indexes), formatBytes(total)];
});

const allocatedTotal = collectionStorage + indexStorage;
print(`Collection: ${databaseName}.${collectionName}`);
print("");
printTable(
  ["Metric", "Size"],
  [
    ["Logical document data (uncompressed)", formatBytes(logicalSize)],
    ["Allocated collection storage", formatBytes(collectionStorage)],
    ["Allocated index storage", formatBytes(indexStorage)],
    ["Allocated physical total (one replica copy)", formatBytes(allocatedTotal)],
  ],
);

if (shardRows.length > 1) {
  print("");
  print("Per-shard storage:");
  printTable(["Shard host", "Logical data", "Collection", "Indexes", "Physical total"], shardRows);
}

print("");
print("Physical total is the allocated compressed collection and index storage on one copy of the data.");
print("It excludes replica copies, oplog, journal, config-server, backup, and filesystem overhead.");
'
