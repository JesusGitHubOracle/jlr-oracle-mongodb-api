#!/usr/bin/env bash

# Report allocated database and index storage for application databases in Atlas.
# Requires mongosh and a URI for a user with the listDatabases and dbStats privileges.

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
MONGO_URI="${MONGO_URI:-}"
INCLUDE_SYSTEM_DATABASES=0

usage() {
  cat <<USAGE
Usage:
  $SCRIPT_NAME --uri URI [--include-system-databases]

Options:
  --uri URI                    Atlas connection URI. May instead be supplied in MONGO_URI.
  --include-system-databases   Also report admin, config, and local.
  -h, --help                   Show this help.

The report shows allocated collection storage, index storage, and their total in
bytes and MiB. By default, admin, config, and local are excluded.

Example:
  export MONGO_URI='mongodb+srv://USER:PASSWORD@cluster.example.mongodb.net/'
  ./$SCRIPT_NAME
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
    --uri=*)
      MONGO_URI="${1#*=}"
      shift
      ;;
    --include-system-databases)
      INCLUDE_SYSTEM_DATABASES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1. Run $SCRIPT_NAME --help for usage."
      ;;
  esac
done

command -v mongosh >/dev/null 2>&1 || die 'mongosh is required but was not found in PATH.'
[ -n "$MONGO_URI" ] || die 'Provide an Atlas URI with --uri or MONGO_URI.'

MONGO_URI="$MONGO_URI" INCLUDE_SYSTEM_DATABASES="$INCLUDE_SYSTEM_DATABASES" mongosh \
  --nodb \
  --quiet \
  --eval '
const systemDatabases = new Set(["admin", "config", "local"]);
const includeSystemDatabases = process.env.INCLUDE_SYSTEM_DATABASES === "1";
const uri = process.env.MONGO_URI;

function isSystemDatabase(name) {
  return systemDatabases.has(name) || name.startsWith("__mdb_internal_");
}

function toBigInt(value) {
  return BigInt(value === undefined || value === null ? 0 : value.toString());
}

function formatBytes(bytes) {
  const units = [
    ["EiB", 1024n ** 6n],
    ["PiB", 1024n ** 5n],
    ["TiB", 1024n ** 4n],
    ["GiB", 1024n ** 3n],
    ["MiB", 1024n ** 2n],
    ["KiB", 1024n],
  ];

  if (bytes < 1024n) return `${bytes} B`;

  for (const [unit, divisor] of units) {
    if (bytes >= divisor) {
      const hundredths = (bytes * 100n + divisor / 2n) / divisor;
      return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")} ${unit}`;
    }
  }
}

function printTable(rows) {
  const headers = ["Database", "Collection storage", "Index storage", "Total occupied"];
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...rows.map((row) => row[index].length),
  ));
  const line = (row) => row.map((cell, index) => (
    index === 0 ? cell.padEnd(widths[index]) : cell.padStart(widths[index])
  )).join("  ");

  print(line(headers));
  print(widths.map((width) => "-".repeat(width)).join("  "));
  rows.forEach((row) => print(line(row)));
}

const connection = new Mongo(uri);
const admin = connection.getDB("admin");
const databases = admin.adminCommand({ listDatabases: 1, nameOnly: true }).databases
  .map(({ name }) => name)
  .filter((name) => includeSystemDatabases || !isSystemDatabase(name))
  .sort((left, right) => left.localeCompare(right));

if (databases.length === 0) {
  print("No application databases found.");
  quit(0);
}

const rows = [];
let totalStorage = 0n;
let totalIndexes = 0n;
let failures = 0;

for (const name of databases) {
  try {
    const stats = connection.getDB(name).stats();
    const storage = toBigInt(stats.storageSize);
    const indexes = toBigInt(stats.indexSize);
    const total = storage + indexes;
    totalStorage += storage;
    totalIndexes += indexes;
    rows.push([name, formatBytes(storage), formatBytes(indexes), formatBytes(total)]);
  } catch (error) {
    failures += 1;
    rows.push([name, "ERROR", "ERROR", error.message]);
  }
}

const grandTotal = totalStorage + totalIndexes;
rows.push(["TOTAL", formatBytes(totalStorage), formatBytes(totalIndexes), formatBytes(grandTotal)]);
printTable(rows);

if (failures > 0) {
  print(`WARNING: Could not read stats for ${failures} database(s). Check the user privileges.`);
  quit(2);
}
'
