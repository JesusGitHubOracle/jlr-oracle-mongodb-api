use("json_aggregations");

const RESET_SAMPLE_DATA = false;
const TRANSFER_AMOUNT = 100;
const FROM_ACCOUNT_ID = "acct-100";
const TO_ACCOUNT_ID = "acct-200";
const APPROVAL_TIMEOUT_MS = 120000;
const APPROVAL_POLL_MS = 1000;

function runSql(sqlDb, statement, binds) {
  const stage = binds
    ? { $sql: { statement, binds } }
    : { $sql: { statement } };

  return sqlDb.aggregate([stage]).toArray();
}

function firstValue(row, names) {
  for (const name of names) {
    if (row && Object.prototype.hasOwnProperty.call(row, name)) {
      return row[name];
    }
  }

  return undefined;
}

function readAccount(sqlDb, accountId) {
  const rows = runSql(
    sqlDb,
    `
      SELECT
        JSON_VALUE(a.data, '$._id') AS account_id,
        JSON_VALUE(a.data, '$.owner') AS owner,
        JSON_VALUE(a.data, '$.balance' RETURNING NUMBER) AS balance
      FROM accounts a
      WHERE JSON_VALUE(a.data, '$._id') = :account_id
    `,
    { account_id: accountId }
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  return {
    _id: firstValue(row, ["ACCOUNT_ID", "account_id"]),
    owner: firstValue(row, ["OWNER", "owner"]),
    balance: firstValue(row, ["BALANCE", "balance"])
  };
}

function waitForApproval(requestId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < APPROVAL_TIMEOUT_MS) {
    const approval = db.transaction_approvals.findOne({ _id: requestId });

    if (approval && approval.decision === "Y") {
      return true;
    }

    if (approval && approval.decision === "N") {
      return false;
    }

    sleep(APPROVAL_POLL_MS);
  }

  throw new Error("Timed out waiting for approval.");
}

if (RESET_SAMPLE_DATA) {
  db.accounts.deleteMany({});
  db.transaction_approvals.deleteMany({});

  db.accounts.insertMany([
    { _id: FROM_ACCOUNT_ID, owner: "Alice", balance: 500 },
    { _id: TO_ACCOUNT_ID, owner: "Bob", balance: 100 }
  ]);
}

print("Balances before transaction:");
db.accounts.find({ _id: { $in: [FROM_ACCOUNT_ID, TO_ACCOUNT_ID] } });

const requestId = new ObjectId();

db.transaction_approvals.insertOne({
  _id: requestId,
  decision: null,
  createdAt: new Date(),
  note: "Set decision to Y to commit, or N to abort."
});

print("Approval request created:");
printjson({
  requestId: requestId.toString(),
  approveCommand: [
    'use("json_aggregations");',
    "printjson(",
    '  db.transaction_approvals.updateOne({ _id: ObjectId("' +
      requestId +
      '") }, { $set: { decision: "Y", decidedAt: new Date() } })',
    ");"
  ].join("\n"),
  denyCommand: [
    'use("json_aggregations");',
    "printjson(",
    '  db.transaction_approvals.updateOne({ _id: ObjectId("' +
      requestId +
      '") }, { $set: { decision: "N", decidedAt: new Date() } })',
    ");"
  ].join("\n"),
  listPendingCommand: [
    'use("json_aggregations");',
    "db.transaction_approvals.find({ decision: null }).sort({ createdAt: -1 });"
  ].join("\n")
});

const session = db.getMongo().startSession();

try {
  session.startTransaction({
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority" },
    readPreference: { mode: "primary" }
  });

  const txDb = session.getDatabase("json_aggregations");

  runSql(txDb, "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

  const from = readAccount(txDb, FROM_ACCOUNT_ID);
  const to = readAccount(txDb, TO_ACCOUNT_ID);

  if (!from || !to) {
    throw new Error("One or both accounts were not found.");
  }

  print("Snapshot seen by this SQL/JSON transaction:");
  printjson({ from, to });

  if (from.balance < TRANSFER_AMOUNT) {
    throw new Error("Insufficient funds.");
  }

  print("Waiting for approval. Use the approveCommand or denyCommand shown above.");

  if (!waitForApproval(requestId)) {
    throw new Error("Transaction was not approved.");
  }

  runSql(
    txDb,
    `
      UPDATE accounts a
      SET a.data = JSON_TRANSFORM(
        a.data,
        SET '$.balance' =
          JSON_VALUE(a.data, '$.balance' RETURNING NUMBER) - :amount
      )
      WHERE JSON_VALUE(a.data, '$._id') = :account_id
    `,
    { amount: TRANSFER_AMOUNT, account_id: FROM_ACCOUNT_ID }
  );

  runSql(
    txDb,
    `
      UPDATE accounts a
      SET a.data = JSON_TRANSFORM(
        a.data,
        SET '$.balance' =
          JSON_VALUE(a.data, '$.balance' RETURNING NUMBER) + :amount
      )
      WHERE JSON_VALUE(a.data, '$._id') = :account_id
    `,
    { amount: TRANSFER_AMOUNT, account_id: TO_ACCOUNT_ID }
  );

  session.commitTransaction();
  print("SQL/JSON transaction committed successfully.");
} catch (err) {
  session.abortTransaction();
  print("SQL/JSON transaction aborted: " + err.message);
} finally {
  session.endSession();
}

print("Balances after transaction:");
db.accounts.find({ _id: { $in: [FROM_ACCOUNT_ID, TO_ACCOUNT_ID] } });
