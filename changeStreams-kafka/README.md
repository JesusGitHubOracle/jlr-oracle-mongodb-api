# Oracle Database API for MongoDB Change Streams to Kafka

This demo shows how to stream changes from Oracle Autonomous AI JSON Database into an Apache Kafka topic using Oracle Database API for MongoDB `$changeStreams`.

The default flow uses a small Node.js CDC producer that opens a MongoDB-compatible change stream and publishes each change event to Kafka.

```text
Oracle Autonomous AI JSON
       |
       v
Oracle API for MongoDB $changeStream
       |
       v
Node.js CDC Producer
       |
       v
Apache Kafka Topic
       |
       +-- Inventory
       +-- Analytics
       +-- Email
       +-- Audit
```

 

The repository also includes a Kafka Connect version of the same pattern under [`kafka-connect/`](kafka-connect/README.md). That version replaces the Node.js CDC producer with Kafka Connect and the MongoDB Kafka Source Connector.

## Pre-requisites

- Oracle Autonomous AI JSON Database with Oracle Database API for MongoDB enabled
- `$changeStreams` enabled in preview mode
- A user with the privileges required to create notification directives
- Node.js 20 or newer
- npm
- Java 17 or newer
- Apache Kafka

For the Oracle user used by this demo, grant the notification directive privilege:

```sql
grant create notification directive to json_aggregations;
```

## Demo Folders

```text
changeStreams-kafka/
  cdc-mongodb-kafka.js
  insert-orders.mongodb.js
  package.json
  README.md
  kafka-connect/
    README.md
```

The parent directory demonstrates the direct `$changeStreams` to Kafka topic flow with Node.js.

The `kafka-connect/` directory demonstrates the same CDC flow using Kafka Connect.

## Default Configuration

The Node.js producer uses environment variables for the Oracle API for MongoDB connection and Kafka settings.

```text
MONGODB_URI=<your Oracle API for MongoDB connection string>
MONGO_DB=shop
MONGO_COLLECTION=orders
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=mongo.orders.cdc
```

Create a local `.env` file from the example if one is provided:

```bash
cd <working dir>/changeStreams-kafka
cp .env.example .env
npm install
```

Then edit `.env` with your own Oracle API for MongoDB connection string.

## Set Up Kafka

Download Apache Kafka from:

```text
https://kafka.apache.org/downloads
```

Extract Kafka and move into the Kafka directory:

```bash
cd /path/to/kafka_2.13-4.3.1
```

On macOS, make sure Kafka uses Java 17:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:$PATH"
java -version
```

## Initialize Kafka Storage

Kafka 4.x uses KRaft mode. Before starting Kafka for the first time, initialize the storage directory:

```bash
KAFKA_CLUSTER_ID="$(bin/kafka-storage.sh random-uuid)"
bin/kafka-storage.sh format --standalone -t "$KAFKA_CLUSTER_ID" -c config/server.properties
```

Run this format command only once for a new Kafka storage directory. If Kafka exits with `No readable meta.properties files found`, the storage directory has not been formatted yet.

## Start Kafka

From the Kafka directory:

```bash
bin/kafka-server-start.sh -daemon config/server.properties
```

Confirm Kafka is listening:

```bash
lsof -i :9092
```

To stop Kafka:

```bash
bin/kafka-server-stop.sh
```

## Create the Kafka Topic

Create the topic used by the demo:

```bash
bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic mongo.orders.cdc
```

If the topic already exists, continue with the demo.

Verify the topic:

```bash
bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic mongo.orders.cdc
```

## Change Streams in Action: Command Line

Open three terminals: `T1`, `T2`, and `T3`.

### T1 - Kafka Broker and Topic

From the Kafka directory:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:$PATH"
bin/kafka-server-start.sh -daemon config/server.properties
bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic mongo.orders.cdc
```

### T2 - Kafka Consumer

From the Kafka directory:

```bash
bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic mongo.orders.cdc --from-beginning
```

Leave this terminal open. It prints the change events published to Kafka.

### T3 - Node.js CDC Producer

From the demo directory:

```bash
cd <working dir>/changeStreams-kafka
node cdc-mongodb-kafka.js
```

The producer opens a `$changeStream` against the configured collection and publishes each change event to the Kafka topic.

The flow is:

```text
Oracle Autonomous AI JSON orders collection
  -> Oracle API for MongoDB $changeStream event
  -> Node.js Kafka producer
  -> mongo.orders.cdc Kafka topic
  -> Kafka console consumer in T2
```

## Generate Changes

Run the insert/update playground from another terminal or from the MongoDB for VS Code extension:

```bash
cd <working dir>/changeStreams-kafka
mongosh "$MONGODB_URI" insert-orders.mongodb.js
```

You should see change events appear in the Node.js producer output and in the Kafka console consumer.

## Change Streams in Action: GUI Option

The `mongo-kafka-cdc-ui/` directory includes a small browser UI for the same demo flow. The UI lets you insert orders from a web page and watch both the Oracle API for MongoDB change stream events and Kafka publish events in real time.

Before starting the GUI, make sure Kafka is running and the `mongo.orders.cdc` topic exists.

From the GUI directory:

```bash
cd <working dir>/changeStreams-kafka/mongo-kafka-cdc-ui
cp .env.example .env
npm install
```

Edit `.env` with your Oracle API for MongoDB connection string:

```text
PORT=3000
MONGODB_URI=<your Oracle API for MongoDB connection string>
MONGO_DB=shop
MONGO_COLLECTION=orders
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=mongo.orders.cdc
ENABLE_PRE_POST_IMAGES=true
```

Start the GUI:

```bash
npm start
```

Open the browser at:

```text
http://localhost:3000
```

Click **Insert Order** to create a new order document. The page shows:

- Oracle API for MongoDB connection status
- Kafka producer status
- Change stream status
- Live change stream events
- Kafka publish confirmations

You can also keep the Kafka console consumer open while using the GUI:

```bash
bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic mongo.orders.cdc --from-beginning
```

When you click **Insert Order**, the event should appear in both the browser UI and the Kafka console consumer.

## Kafka Connect Option

Kafka Connect is useful when you want Kafka to manage the CDC connector lifecycle instead of maintaining a custom producer process.

Use the Kafka Connect version when you want:

- A connector-managed source process
- Standard Kafka Connect configuration files
- Operational consistency with other Kafka ingestion pipelines
- A reusable runbook for customer demos

Start with [`kafka-connect/README.md`](kafka-connect/README.md).

## Troubleshooting

### Kafka exits with `No readable meta.properties files found`

Kafka storage was not initialized. Run:

```bash
KAFKA_CLUSTER_ID="$(bin/kafka-storage.sh random-uuid)"
bin/kafka-storage.sh format --standalone -t "$KAFKA_CLUSTER_ID" -c config/server.properties
```

Then start Kafka again.

### Oracle API for MongoDB user gets insufficient privileges

Grant the notification directive privilege to the schema/user used by the demo:

```sql
grant create notification directive to json_aggregations;
```

### Kafka consumer shows no messages

Check:

- Kafka is running on `localhost:9092`
- The topic name matches `KAFKA_TOPIC`
- The Node.js producer is running
- The insert/update script is writing to the same database and collection watched by the producer
- `$changeStreams` is enabled for the Oracle API for MongoDB environment

## References

- [Oracle API for MongoDB - Feature Support (Change Streams)](https://docs.oracle.com/en/database/oracle/mongodb-api/mgapi/support-mongodb-apis-operations-and-data-types-reference.html#GUID-48B388E6-356B-4A6F-AE51-42BE9C635378)
- [MongoDB Change Streams](https://www.mongodb.com/docs/manual/changeStreams/)
- [Apache Kafka Quickstart](https://kafka.apache.org/quickstart)
- [Kafka Connect](https://kafka.apache.org/documentation/#connect)
