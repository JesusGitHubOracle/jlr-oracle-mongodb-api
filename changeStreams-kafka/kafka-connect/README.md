# Kafka Connect Change Streams  

This runbook shows how to stream Oracle Database API for MongoDB `$changeStreams` events into Kafka using Kafka Connect and the MongoDB Kafka Source Connector.

```text
Oracle Database API for MongoDB
  -> $changeStreams on shop.orders
  -> MongoDB Kafka Source Connector
  -> Kafka topic: mongo.orders.cdc
  -> Kafka consumer
```

## Demo Files

- `config/connect-standalone.properties` configures the local Kafka Connect standalone worker.
- `config/mongodb-source-orders.properties` configures the MongoDB Kafka Source Connector for `shop.orders`.
- `start-connect.sh` starts Kafka Connect with the worker and source connector configs.
- `patch-connector.sh` downloads and patches the MongoDB Kafka Connector locally.
- `.env.example` shows the expected `MONGODB_URI` format.
- `PATCH-NOTES.md` documents the local connector patch used for Oracle Database API for MongoDB compatibility.

## Prerequisites

- Java 17 or newer.
- Kafka 4.3.1 available in `../kafka_2.13-4.3.1`.
- Oracle Database API for MongoDB endpoint.
- A database user that can use `$changeStreams`.
- MongoDB shell or MongoDB for VS Code to generate test changes.

For this demo, the MongoDB API database and collection are:

```text
database:   shop
collection: orders
topic:      mongo.orders.cdc
```

For Oracle Database API for MongoDB, grant the change stream privilege to the demo user:

```sql
GRANT CREATE NOTIFICATION DIRECTIVE TO shop;
```

## Connector Patch

This demo uses a patched local copy of the MongoDB Kafka Connector. Generate it locally with:

```bash
cd /Users/jlrobles/Documents/GitHub/jlr-oracle-mongodb-api/changeStreams-kafka
kafka-connect/patch-connector.sh
```

The script downloads the official connector JAR, applies the demo compatibility patch, and writes:

```text
kafka-connect/plugins/mongo-kafka-connect-3.0.1-all.jar
```

The original connector JAR is preserved as:

```text
kafka-connect/plugins/mongo-kafka-connect-3.0.1-all.jar.orig
```

The patch makes two Oracle compatibility changes:

- It skips the connector startup validation that calls MongoDB `rolesInfo`, because Oracle Database API for MongoDB does not support that command.
- It treats a missing `operationTime` field in change stream command responses as an empty offset timestamp instead of throwing a `NullPointerException`.

See `PATCH-NOTES.md` for details.

## Step 1: Start Kafka

Open terminal `T1` and go to the demo directory:

```bash
cd <Working diectory>/changeStreams-kafka
cd kafka_2.13-4.3.1
```

If this is the first time starting Kafka, or if `/tmp/kraft-combined-logs` was deleted, format Kafka storage:

```bash
KAFKA_CLUSTER_ID="$(bin/kafka-storage.sh random-uuid)"

bin/kafka-storage.sh format \
  --standalone \
  -t "$KAFKA_CLUSTER_ID" \
  -c config/server.properties
```

Start Kafka if not already done:

```bash
cd <Working diectory>/changeStreams-kafka
bin/kafka-server-start.sh -daemon config/server.properties
```

Confirm Kafka started:

```bash
tail -f logs/server.log
```

Expected message:

```text
Kafka Server started
```

## Step 2: Create the Kafka Topic

From the Kafka directory:

```bash
bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create \
  --topic mongo.orders.cdc
```

If the topic already exists, that is fine.

Verify the topic:

```bash
bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --topic mongo.orders.cdc
```

## Step 3: Start a Kafka Consumer

Open terminal `T2`:

```bash
cd < Working Directory>/changeStreams-kafka

kafka_2.13-4.3.1/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic mongo.orders.cdc \
  --from-beginning
```

Leave this terminal running. It prints change stream events published by Kafka Connect.

## Step 4: Configure the Oracle MongoDB API URI

Open terminal `T3`:

```bash
cd <Working Directory>/changeStreams-kafka
```

Set the Oracle Database API for MongoDB URI:

```bash
export MONGODB_URI='mongodb://USER:PASSWORD@HOST:PORT/shop?authMechanism=PLAIN&authSource=$external&ssl=true&retryWrites=false&loadBalanced=true'
```

The Kafka Connect source connector reads this value from the environment:

```properties
connection.uri=${env:MONGODB_URI}
```

## Step 5: Start Kafka Connect

From terminal `T3`:

```bash
cd <Working Directory>/changeStreams-kafka
kafka-connect/start-connect.sh
```

Expected messages:

```text
Created connector mongodb-source-orders
Watching for collection changes on 'shop.orders'
New change stream cursor created without offset.
Started MongoDB source task
Source task finished initialization and start
```

Leave Kafka Connect running.

## Step 6: Generate Test Changes

Open terminal `T4`, MongoDB for VS Code, or `mongosh`, and connect to the same Oracle Database API for MongoDB endpoint.

Insert and update an order:

```javascript
use("shop");

db.orders.insertOne({
  orderId: 2001,
  customer: "Customer-2001",
  total: 125,
  status: "NEW",
  createdAt: new Date()
});

db.orders.updateOne(
  { orderId: 2001 },
  { $set: { status: "PAID" } }
);
```

## Step 7: Verify Kafka Output

Return to terminal `T2`.

You should see JSON change stream events in the `mongo.orders.cdc` topic. Insert events include the inserted document. Update events include metadata such as `documentKey` and `updateDescription`.

The successful flow is:

```text
Insert/update in shop.orders
  -> Oracle Database API for MongoDB $changeStreams
  -> Kafka Connect MongoDB source connector
  -> mongo.orders.cdc Kafka topic
  -> Kafka console consumer
```

## Configuration Summary

`config/mongodb-source-orders.properties` contains the important connector settings:

```properties
name=mongodb-source-orders
connector.class=com.mongodb.kafka.connect.MongoSourceConnector
connection.uri=${env:MONGODB_URI}
database=shop
collection=orders
topic.namespace.map={"shop.orders":"mongo.orders.cdc"}
publish.full.document.only=false
change.stream.full.document=
change.stream.full.document.before.change=whenAvailable
pipeline=[{"$match":{"operationType":{"$in":["insert","update","replace","delete"]}}}]
startup.mode=latest
```

`startup.mode=latest` means the connector starts with new changes only.

## Troubleshooting

If Kafka fails with `No readable meta.properties files found`, format Kafka storage:

```bash
KAFKA_CLUSTER_ID="$(kafka_2.13-4.3.1/bin/kafka-storage.sh random-uuid)"

kafka_2.13-4.3.1/bin/kafka-storage.sh format \
  --standalone \
  -t "$KAFKA_CLUSTER_ID" \
  -c kafka_2.13-4.3.1/config/server.properties
```

If Kafka Connect reports `Unknown command rolesInfo`, confirm it is using the patched connector JAR from:

```text
kafka-connect/plugins/mongo-kafka-connect-3.0.1-all.jar
```

If Kafka Connect logs repeated `NullPointerException` messages from `ResumeTokenUtils.getResponseOffsetSecs`, confirm it is using the patched connector JAR.

If no events appear in Kafka:

- Confirm Kafka is running on `localhost:9092`.
- Confirm the `mongo.orders.cdc` topic exists.
- Confirm `MONGODB_URI` points to the Oracle Database API for MongoDB endpoint.
- Confirm the connector logs show `Started MongoDB source task`.
- Insert or update documents after Kafka Connect has started, because `startup.mode=latest` listens for new changes.

## References

- [MongoDB Kafka Source Connector](https://www.mongodb.com/docs/kafka-connector/current/source-connector/)
- [MongoDB Kafka Source Connector Configuration Properties](https://www.mongodb.com/docs/kafka-connector/current/source-connector/configuration-properties/)
- [Oracle API for MongoDB - Feature Support](https://docs.oracle.com/en/database/oracle/mongodb-api/mgapi/support-mongodb-apis-operations-and-data-types-reference.html)
