# MongoDB Change Streams with Oracle Database API for MongoDB

This example shows how to enable `$changeStreams` in preview mode and use it from the MongoDB API.

## Files

- `watch-orders.mongodb.js` enables change streams on `xs_orders` and starts watching for `insert`, `update`, and `delete` events.
- `insert-orders.mongodb.js` recreates the sample collection, inserts one order, and updates that order so the watcher can receive events.

## Required Privilege

Before enabling change streams, grant the schema permission to create notification directives:

```sql
GRANT CREATE NOTIFICATION DIRECTIVE TO json_aggregations;
```

Run the grant as `ADMIN` or another privileged database user.

## Run the Example

1. Open VS Code with the MongoDB for VS Code extension installed, or use `mongosh`.
2. Connect to the Oracle Database API for MongoDB endpoint.
3. Run `watch-orders.mongodb.js`. Leave it running so it can listen for changes.
4. Run `insert-orders.mongodb.js` in a second editor or `mongosh` session.

The watcher listens on:

```javascript
use("json_aggregations");

const changeStream = db.xs_orders.watch([
  {
    $match: {
      operationType: {
        $in: ["insert", "update", "delete"]
      }
    }
  }
]);
```

The writer generates sample activity:

```javascript
db.xs_orders.insertOne({
  customerId: 123,
  status: "created",
  total: 42.5
});

db.xs_orders.updateOne(
  { customerId: 123 },
  { $set: { status: "paid" } }
);
```

## Notes

- The watcher uses `collMod` with `enableChangeStream` before opening the stream.
- The script filters events to `insert`, `update`, and `delete`.
- If you see `ORA-01031: insufficient privileges`, confirm that `CREATE NOTIFICATION DIRECTIVE` was granted directly to `json_aggregations`.

## REFERENCES

- [Oracle API for MongoDB - Feature Support (Change Streams)](https://docs.oracle.com/en/database/oracle/mongodb-api/mgapi/support-mongodb-apis-operations-and-data-types-reference.html#GUID-48B388E6-356B-4A6F-AE51-42BE9C635378)
- [MongoDB Change Streams](https://www.mongodb.com/docs/manual/changeStreams/)
