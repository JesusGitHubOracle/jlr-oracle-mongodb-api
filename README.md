# MongoDB Migration Toolkit

This directory contains helper scripts and working folders for moving MongoDB application databases into Oracle Autonomous AI JSON Database or Oracle Database API for MongoDB.

The workflow is:

1. Back up selected MongoDB application databases with `mongodump`.
2. Optionally extract MongoDB index definitions for review or later recreation.
3. Restore the generated archive files into the target MongoDB-compatible endpoint.
4. Review restore logs and summary files.

## Directory Layout

```text
migration/
  backup-app-dbs.sh          Back up MongoDB databases into compressed archive files.
  restore-db-archives.sh     Restore compressed archive files into a target endpoint.
  extract-db-indexes.sh      Export MongoDB collection index definitions as JSON.
  backups/                   Timestamped backup runs created by backup-app-dbs.sh.
  indexes/                   Index JSON files created by extract-db-indexes.sh.
  restore-logs/              Restore logs and Markdown restore summaries.
```

Example backup output:

```text
backups/20260707_103121/
  json_aggregations.archive.gz
  json_orders.archive.gz
```

Example restore summary:

```text
restore-logs/
  restore_20260707_105740.log
  restore_20260707_105740_summary.md
```

## Prerequisites

- MongoDB Database Tools, including `mongodump` and `mongorestore`.
- MongoDB Shell, `mongosh`.
- A source MongoDB connection URI.
- A target Oracle Database API for MongoDB connection URI.
- Network access from the machine running the scripts to both source and target endpoints.

Keep credentials out of the scripts. Pass connection strings through environment variables or a secure shell/session mechanism.

## 1. Back Up Application Databases

Use `backup-app-dbs.sh` to create one compressed archive per database.

Run from the `migration/` directory:

```bash
cd migration

export MONGO_URI='mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true&w=majority'
export APP_DATABASES='json_orders json_aggregations'

./backup-app-dbs.sh
```

The script creates a timestamped folder under `backups/`:

```text
backups/YYYYMMDD_HHMMSS/<database>.archive.gz
```

To back up all non-system databases, set `BACKUP_MODE=all`:

```bash
export MONGO_URI='mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true&w=majority'
export BACKUP_MODE='all'

./backup-app-dbs.sh
```

By default, all-mode excludes:

```text
admin local config
```

You can override the output location:

```bash
export BACKUP_DIR='./backups'
```

## 2. Extract Index Definitions

Use `extract-db-indexes.sh` to save each collection's MongoDB index definitions as JSON files.

```bash
cd migration

./extract-db-indexes.sh json_orders 'mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true&w=majority'
```

The script:

- Lists collections in the requested database.
- Skips MongoDB views because views do not have collection indexes.
- Writes index definitions under `indexes/`.

Example output files:

```text
indexes/
  accounts_indexes.json
  customers_indexes.json
  transactions_indexes.json
```

These files are useful for migration review, compatibility checks, and deciding whether indexes should be restored automatically or recreated manually after the data load.

## 3. Restore Database Archives

Use `restore-db-archives.sh` to restore every `*.archive.gz` file from a backup directory.

```bash
cd migration

export TARGET_URI='mongodb://USER:PASSWORD@HOST:PORT/?authMechanism=PLAIN&authSource=$external&ssl=true'

./restore-db-archives.sh ./backups/20260707_103121
```

For each archive, the script:

- Derives the database name from the file name.
- Restores only that database namespace with `--nsInclude="<database>.*"`.
- Continues to the next archive if one restore fails.
- Counts restored documents after each database restore.
- Writes a detailed log and Markdown summary.

By default, `admin`, `local`, and `config` archive files are skipped if present.

## Restore Options

Drop existing target collections before restoring:

```bash
export DROP_EXISTING=1
```

Skip index restore:

```bash
export SKIP_INDEXES=1
```

This is useful when index creation fails during restore, when indexes are not supported in the same form on the target, or when you want to recreate indexes separately after the data load.

Write logs to a custom directory:

```bash
export LOG_DIR='./restore-logs'
```

Restore system database archives if needed:

```bash
export SKIP_SYSTEM_DBS=0
```

Then run:

```bash
./restore-db-archives.sh ./backups/20260707_103121
```

## Restore Logs and Summary

Each restore run creates:

```text
restore-logs/restore_YYYYMMDD_HHMMSS.log
restore-logs/restore_YYYYMMDD_HHMMSS_summary.md
```

The summary contains one row per database:

```markdown
| Database | Documents | Restore errors | Status |
|---|---:|---|---|
| json_aggregations | 84 | No | OK |
| json_orders | 2008206 | No | OK |
```

Use the log file for detailed `mongorestore` output and the summary file for a quick run result.

## Recommended Migration Runbook

1. Confirm source and target connectivity with `mongosh`.
2. Back up explicit application databases first with `APP_DATABASES`.
3. Extract index definitions for each source database.
4. Restore to a clean target environment.
5. Review the restore summary and detailed logs.
6. Validate document counts and application queries.
7. Decide whether to keep restored indexes or recreate selected indexes manually.
8. Repeat with `DROP_EXISTING=1` only when replacing target collections is intentional.

## Troubleshooting

If a restore fails because a target collection already exists, rerun with:

```bash
export DROP_EXISTING=1
```

If the target still reports an existing object, check whether a conflicting Oracle-side object exists. Quoted identifiers may be required when object names preserve lowercase or mixed-case spelling:

```sql
drop table "JSON_ORDERS"."purchaseorders" cascade constraints;
```

If index creation fails during restore, retry the data load without indexes:

```bash
export SKIP_INDEXES=1
./restore-db-archives.sh ./backups/20260707_103121
```

Then use the files in `indexes/` to review and recreate the indexes that are appropriate for the target platform.

## Notes

- Backup archives are compressed with `--gzip`.
- Restore currently processes files ending in `.archive.gz`.
- Database names are inferred from archive file names.
- The scripts are intended for application databases, not MongoDB internal system databases.
- Large migrations should be tested with representative data before a final migration window.
