const { MongoClient } = require("mongodb");
const { Kafka } = require("kafkajs");
const readline = require("readline");

const MONGO_URI = process.argv[2] || process.env.MONGO_URI || process.env.MONGODB_URI;
const DATABASE = "shop";
const COLLECTION = "orders";

const KAFKA_BROKER = "localhost:9092";
const TOPIC = "mongo.orders.cdc";

/**
 * Verifies that a MongoDB URI was provided before the script starts.
 * The URI can be passed as the first command-line argument or through
 * the MONGO_URI / MONGODB_URI environment variable.
 */
function validateMongoUri() {
  if (MONGO_URI) return;

  console.error("Missing MongoDB URI.");
  console.error("");
  console.error("Run with a command-line parameter:");
  console.error('  node cdc-mongodb-to-kafka.js "mongodb://localhost:27017/?replicaSet=rs0"');
  console.error("");
  console.error("Or set an environment variable:");
  console.error('  MONGO_URI="mongodb://localhost:27017/?replicaSet=rs0" node cdc-mongodb-to-kafka.js');
  process.exit(1);
}

/**
 * Connects to MongoDB and Kafka, starts the change stream watcher, and opens
 * a small command-line prompt that can insert demo orders into MongoDB.
 */
async function main() {
  validateMongoUri();

  const mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();

  const db = mongoClient.db(DATABASE);
  const collection = db.collection(COLLECTION);

  // Enable change stream pre/post images for the orders collection.
  // If the command fails, the demo can still continue.
  try {
    await db.command({
      collMod: COLLECTION,
      changeStreamPreAndPostImages: { enabled: true },
    });
  } catch (err) {
    console.warn("Could not enable change stream pre/post images.");
    console.warn(err.message);
  }

  const kafka = new Kafka({
    clientId: "mongo-cdc-service",
    brokers: [KAFKA_BROKER],
  });

  const producer = kafka.producer();
  await producer.connect();

  console.log("Connected to MongoDB and Kafka");
  console.log("--------------------------------------");
  console.log("MongoDB URI :", MONGO_URI);
  console.log("Kafka Broker:", KAFKA_BROKER);
  console.log("Kafka Topic :", TOPIC);
  console.log("Resume      : DISABLED");
  console.log("--------------------------------------");

  const pipeline = [
    {
      $match: {
        operationType: {
          $in: ["insert", "update", "replace", "delete"],
        },
      },
    },
  ];

  const changeStream = collection.watch(pipeline, {
  //  fullDocument: "updateLookup",
    fullDocumentBeforeChange: "whenAvailable",
  });

  console.log("Started NEW change stream (no resume token).");

  //
  // Background task: Watch MongoDB and publish to Kafka
  //
  (async () => {
    try {
      for await (const change of changeStream) {
        const message = {
          operationType: change.operationType,
          database: change.ns?.db,
          collection: change.ns?.coll,
          documentKey: change.documentKey,
          fullDocument: change.fullDocument,
          fullDocumentBeforeChange: change.fullDocumentBeforeChange,
          updateDescription: change.updateDescription,
          clusterTime: change.clusterTime,
        };

        await producer.send({
          topic: TOPIC,
          messages: [
            {
              key: JSON.stringify(change.documentKey || {}),
              value: JSON.stringify(message),
            },
          ],
        });

        console.log(`Published ${change.operationType} to Kafka`);
      }
    } catch (err) {
      console.error("Change stream error:", err.message);
    }
  })();

  //
  // Interactive prompt
  //
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let orderNumber = 1000;

  /**
   * Prompts the user to insert demo orders.
   * A "Y" answer writes a new order document, which triggers the change stream.
   * Any other answer closes Kafka, MongoDB, and the readline prompt.
   */
  function prompt() {
    rl.question("\nInsert a new order? (Y/N): ", async (answer) => {
      if (answer.toUpperCase() === "Y") {
        const order = {
          orderId: orderNumber++,
          customer: `Customer-${orderNumber}`,
          total: Math.floor(Math.random() * 500) + 50,
          status: "NEW",
          createdAt: new Date(),
        };

        await collection.insertOne(order);

        console.log("Inserted:");
        console.log(order);

        prompt();
      } else {
        console.log("Goodbye.");

        await producer.disconnect();
        await mongoClient.close();
        rl.close();
        process.exit(0);
      }
    });
  }

  prompt();
}

main().catch(console.error);