# MongoDB Transactions with Oracle Database API for MongoDB

This example shows how to run MongoDB-style transactions with the Oracle Database API for MongoDB. It uses a bank transfer scenario where money is moved from one account to another only after an approval document is updated.

## Files

- `bank-transfer.mongodb.js` runs the transfer with MongoDB API reads and updates inside a transaction.
- `bank-transfer-sqljson.mongodb.js` runs the transfer with SQL/JSON reads and updates through `$sql` inside a MongoDB API transaction.

## Sample Data

Both scripts use the `json_aggregations` database and these collections:

- `accounts`
- `transaction_approvals`

The sample accounts are:

```javascript
{ _id: "acct-100", owner: "Alice", balance: 500 }
{ _id: "acct-200", owner: "Bob", balance: 100 }
```

If you need to recreate the sample data, set this value to `true` in the script before running it:

```javascript
const RESET_SAMPLE_DATA = true;
```

## Run the Example

1. Open VS Code with the MongoDB for VS Code extension installed, or use `mongosh`.
2. Connect to the Oracle Database API for MongoDB endpoint.
3. Run `bank-transfer.mongodb.js` or `bank-transfer-sqljson.mongodb.js`.
4. Copy the generated `approveCommand` or `denyCommand`.
5. Run that command in a second editor or `mongosh` session before the approval timeout expires.

Approve the transfer with a command like:

```javascript
use("json_aggregations");

printjson(
  db.transaction_approvals.updateOne(
    { _id: ObjectId("<request-id>") },
    { $set: { decision: "Y", decidedAt: new Date() } }
  )
);
```

Deny the transfer with:

```javascript
use("json_aggregations");

printjson(
  db.transaction_approvals.updateOne(
    { _id: ObjectId("<request-id>") },
    { $set: { decision: "N", decidedAt: new Date() } }
  )
);
```

## What the Transaction Does

The transaction:

1. Starts a session and transaction.
2. Reads the source and destination accounts.
3. Checks that the source account has enough funds.
4. Waits for an approval decision.
5. Debits `acct-100` by `100`.
6. Credits `acct-200` by `100`.
7. Commits if approved, or aborts if denied, timed out, or failed.

The MongoDB API version updates balances with `$inc`:

```javascript
accounts.updateOne(
  { _id: "acct-100" },
  { $inc: { balance: -100 } }
);

accounts.updateOne(
  { _id: "acct-200" },
  { $inc: { balance: 100 } }
);
```

The SQL/JSON version updates balances with `JSON_TRANSFORM` through `$sql`.

## Notes

- The approval wait time is controlled by `APPROVAL_TIMEOUT_MS`.
- A decision of `"Y"` commits the transaction.
- A decision of `"N"` aborts the transaction.
- The SQL/JSON example sets the transaction isolation level to `SERIALIZABLE`.
