# Build Document Oriented Applications using Oracle Autonomous AI JSON Database

This repository contains examples of how to use Oracle JSON and the Oracle Database API for MongoDB to keep document-oriented application patterns while running on Oracle Database.

The main flow is:

1. Migrate MongoDB application databases into Oracle Autonomous AI JSON Database.
2. Load JSON collections into Oracle.
3. Use Oracle JSON features directly with SQL.
4. Use or develop MongoDB aggregation pipelines through the Oracle Database API for MongoDB.
5. Add text search and semantic search capabilities over the same document data.

## Prerequisites

- Oracle AI Autonomous Database or Oracle Database 26ai, on-premises or cloud.
- Oracle REST Data Services. See [Oracle REST Data Services and Database Actions downloads](https://www.oracle.com/database/sqldeveloper/technologies/db-actions/download/).
- MongoDB client tools and drivers supported by Oracle Database API for MongoDB. See [Client Tools and Drivers](https://docs.oracle.com/en/database/oracle/mongodb-api/mgapi/support-mongodb-apis-operations-and-data-types-reference.html#GUID-0D110BE7-7BB3-4DC3-9A98-4F517271F2AE) in the Oracle documentation.

## Migration

Directory: `migration/`

These scripts help move MongoDB application databases into Oracle Autonomous AI JSON Database through backup, restore, and index metadata capture.

Key files:

- `backup-app-dbs.sh` backs up MongoDB databases with `mongodump`. Use `APP_DATABASES` to back up a specific list, or set `BACKUP_MODE=all` to back up all databases except `admin`, `local`, and `config`.

```bash
export MONGO_URI='mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true&w=majority'
export APP_DATABASES='appdb1 appdb2'
./migration/backup-app-dbs.sh

export BACKUP_MODE='all'
./migration/backup-app-dbs.sh
```

- `restore-db-archives.sh` restores every `*.archive.gz` file from a backup directory with `mongorestore`, writes restore logs, and produces a summary file.

```bash
./migration/restore-db-archives.sh ./backups/20260706_120000
```

- `extract-db-indexes.sh` exports collection index definitions from a MongoDB database into JSON files under `indexes/`. Update the script's `DB` and `URI` values before running it.

```bash
./migration/extract-db-indexes.sh
```

## Topics

### 1. Aggregation Pipelines

Directory: `aggregations/`

These examples show how to create JSON collection tables, load document data, and compare Oracle SQL/JSON approaches with MongoDB API aggregation pipelines.

Key files:

- `00-create-agg-user.sql` creates the aggregation demo user.
- `01-enrich-orders-oracle-json.sql` loads order, product, and warehouse JSON collections and builds an enriched order document with Oracle SQL/JSON.
- `02-enrich-orders-mongoapi.mongodb.js` loads the same data through the MongoDB API and enriches orders with `$lookup`, `$set`, `$unset`, and `$merge`.
- `03-regex-filter.mongodb.js` demonstrates regex filtering.
- `04-lookup-plants.mongodb.js` demonstrates lookup patterns across facility and plant documents.
- `05-lookup-plants-sql.mongodb.js` shows the SQL-oriented equivalent.
- `06-lookup-offers-sql.mongodb.js` creates `offerSummary` and `ifaOfferDaily100`, matches offer events by offer, widget, country, and date range, then returns rolled-up metrics in a `replacement` array.

### 2. Text Search

Directory: `search/`

These examples show how to use MongoDB-style `$search` over JSON movie documents stored in Oracle.

Key files:

- `01-create-text-user.sql` creates the text search demo user and grants the required privileges.
- `02-text-search-orclapi.mongodb.js` demonstrates text search patterns such as single-term search, multi-term search, `matchCriteria`, and fuzzy matching.
- Sample collection: [mflix_movies.json](https://objectstorage.eu-frankfurt-1.oraclecloud.com/p/E_Hz1fFFFfbbIGstyg3beN0_WP6QQwwzATe_BsPXhCiGUeaSoH0WjLU7tBZnzglZ/n/fro8fl9kuqli/b/bucket-for-ajd-data/o/search/mflix_movies.json)

### 3. Semantic Search

Directory: `vectorsearch/`

These examples show semantic search over JSON documents by using vector embeddings together with Oracle JSON collections and the MongoDB API.

Key files:

- `01-load_all_minilm_model_from_par.sql` loads the MiniLM embedding model.
- `02-create-vector-embeddings.sql` creates embeddings for movie plot data.
- `03-embed-prompt.sql` embeds a natural-language prompt.
- `04-vector-search.mongodb.js` demonstrates vector search through the MongoDB API.
- Vectorized collection: [mflix_movies_embeddings.json](https://objectstorage.eu-frankfurt-1.oraclecloud.com/p/yZJUDkTpVHdAI4vTUcuofDHWkk8w5sr2DoawtQ4PL9gQ-7hnHuNLH0gvOQNjJIRo/n/fro8fl9kuqli/b/bucket-for-ajd-data/o/search/mflix_movies_embeddings.json)
- Embedding model: [ALL_MINILM_L12_V2](https://objectstorage.eu-frankfurt-1.oraclecloud.com/p/hWtxHRNpBnQKaxtj5KtGVyQu4VYHqtuqAY4PUReK_6NxCeZRl94vm07lMGZAuOih/n/fro8fl9kuqli/b/bucket-for-ajd-data/o/vector-data/all_MiniLM_L12_v2.onnx)

## References

- [Oracle JSON Developer's Guide](https://docs.oracle.com/en/database/oracle/oracle-database/26/adjsn/)
- [Oracle AI Vector Search Overview](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/overview-ai-vector-search.html)
- [Oracle Database API for MongoDB](https://docs.oracle.com/en/database/oracle/mongodb-api/mgapi/overview-oracle-database-api-mongodb.html)
- [Oracle JSON: From relational to document store](https://github.com/JesusGitHubOracle/jlr-oracle-json)
- [MongoDB Developer Documentation](https://www.mongodb.com/docs/development/)

## License

Copyright (c) 2026 Oracle and/or its affiliates.

Released under the Universal Permissive License v1.0 as shown at [https://oss.oracle.com/licenses/upl/](https://oss.oracle.com/licenses/upl/).

## Disclaimer

ORACLE AND ITS AFFILIATES DO NOT PROVIDE ANY WARRANTY WHATSOEVER, EXPRESS OR IMPLIED, FOR ANY SOFTWARE, MATERIAL OR CONTENT OF ANY KIND CONTAINED OR PRODUCED WITHIN THIS REPOSITORY, AND IN PARTICULAR SPECIFICALLY DISCLAIM ANY AND ALL IMPLIED WARRANTIES OF TITLE, MERCHANTABILITY, AND FITNESS FOR A PARTICULAR PURPOSE. FURTHERMORE, ORACLE AND ITS AFFILIATES DO NOT REPRESENT THAT ANY CUSTOMARY SECURITY REVIEW HAS BEEN PERFORMED WITH RESPECT TO ANY SOFTWARE, MATERIAL OR CONTENT CONTAINED OR PRODUCED WITHIN THIS REPOSITORY. IN ADDITION, AND WITHOUT LIMITING THE FOREGOING, THIRD PARTIES MAY HAVE POSTED SOFTWARE, MATERIAL OR CONTENT TO THIS REPOSITORY WITHOUT ANY WARRANTY OF ANY KIND, INCLUDING THAT THE CONTENT IS FREE OF DEFECTS, MERCHANTABLE, FIT FOR A PARTICULAR PURPOSE OR NON-INFRINGING. ANY OPEN SOURCE SOFTWARE IS PROVIDED BY THE APPLICABLE LICENSOR "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
