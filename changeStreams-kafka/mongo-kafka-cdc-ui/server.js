const path = require("path");
const http = require("http");

const dotenv = require("dotenv");
const express = require("express");
const { Kafka } = require("kafkajs");
const { MongoClient } = require("mongodb");
const { Server } = require("socket.io");

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI  
const MONGO_DB = process.env.MONGO_DB || "shop";
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || "orders";
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || "mongo.orders.cdc";
const ENABLE_PRE_POST_IMAGES = process.env.ENABLE_PRE_POST_IMAGES !== "false";


const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let mongoClient;
let collection;
let producer;
let kafkaReady = false;
let mongoReady = false;

const status = {
  mongo: "starting",
  kafka: "starting",
  changeStream: "starting",
  lastKafkaPublish: null,
  lastError: null,
};

function emitStatus() {
  io.emit("status", status);
}

function setStatus(key, value, extra = {}) {
  status[key] = value;
  Object.assign(status, extra);
  emitStatus();
}

function emitEvent(type, payload) {
  io.emit("event", {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    at: new Date().toISOString(),
    payload,
  });
}


function serializeForJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function connectMongo() {
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();

  const db = mongoClient.db(MONGO_DB);
   
  if (ENABLE_PRE_POST_IMAGES) {
    try {
      await db.command({
        collMod: MONGO_COLLECTION,
        changeStreamPreAndPostImages: { enabled: true },
      });
    } catch (err) {
      emitEvent("warning", {
        message: "Could not enable change stream pre/post images.",
        detail: err.message,
      });
    }
  }

  collection = db.collection(MONGO_COLLECTION);
  mongoReady = true;
  setStatus("mongo", "connected");
}

async function connectKafka() {
  const kafka = new Kafka({
    clientId: "mongo-kafka-cdc-demo",
    brokers: KAFKA_BROKERS,
    retry: { retries: 3 },
  });

  producer = kafka.producer();
  await producer.connect();
  kafkaReady = true;
  setStatus("kafka", "connected");
}

async function ensureKafkaReady() {
  if (kafkaReady) return;

  try {
    setStatus("kafka", "connecting");
    await connectKafka();
  } catch (err) {
    kafkaReady = false;
    setStatus("kafka", "error", { lastError: err.message });
    throw err;
  }
}

async function publishChangeToKafka(change) {
  const event = {
    operationType: change.operationType,
    database: change.ns?.db,
    collection: change.ns?.coll,
    documentKey: change.documentKey,
    fullDocument: change.fullDocument,
    fullDocumentBeforeChange: change.fullDocumentBeforeChange,
    updateDescription: change.updateDescription,
    clusterTime: change.clusterTime,
  };

  await ensureKafkaReady();

  await producer.send({
    topic: KAFKA_TOPIC,
    messages: [
      {
        key: JSON.stringify(change.documentKey || {}),
        value: JSON.stringify(event),
      },
    ],
  });

  setStatus("kafka", "published", { lastKafkaPublish: new Date().toISOString() });
  setTimeout(() => {
    if (status.kafka === "published") setStatus("kafka", "connected");
  }, 1200);
}

async function watchChangesForever() {
  while (true) {
    try {
      const pipeline = [
        {
          $match: {
            operationType: { $in: ["insert", "update", "replace", "delete"] },
          },
        },
      ];

      const options = {
        //fullDocument: "updateLookup",
        fullDocumentBeforeChange: "whenAvailable",
      };

      setStatus("changeStream", "watching");

      const changeStream = collection.watch(pipeline, options);

      for await (const change of changeStream) {
        const safeChange = serializeForJson(change);
        emitEvent("mongo-change", safeChange);

        try {
          await publishChangeToKafka(change);
          emitEvent("kafka-published", {
            topic: KAFKA_TOPIC,
            operationType: change.operationType,
            documentKey: change.documentKey,
          });
        } catch (err) {
          emitEvent("kafka-error", {
            message: "MongoDB change was seen, but Kafka publish failed.",
            detail: err.message,
          });
        }
      }
    } catch (err) {
      setStatus("changeStream", "error", { lastError: err.message });
      emitEvent("error", {
        message: "Change stream stopped. Retrying in 3 seconds.",
        detail: err.message,
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    status,
    mongoReady,
    kafkaReady,
    mongo: `${MONGO_DB}.${MONGO_COLLECTION}`,
    kafkaTopic: KAFKA_TOPIC,
    mongoUri: MONGODB_URI,
  });
});

app.post("/api/orders", async (req, res) => {
  if (!mongoReady) {
    res.status(503).json({ error: "MongoDB is not connected yet." });
    return;
  }

  const body = req.body || {};
  const total = Number(body.total || Math.floor(Math.random() * 450) + 50);

  const order = {
    orderId: `ORD-${Date.now()}`,
    customer: String(body.customer || "Demo Customer"),
    total,
    status: String(body.status || "NEW"),
    createdAt: new Date(),
  };

  const result = await collection.insertOne(order);
  res.status(201).json({ ...order, _id: result.insertedId });
});

io.on("connection", (socket) => {
  socket.emit("status", status);
  socket.emit("config", { mongoUri: MONGODB_URI });
});

async function start() {
  server.listen(PORT, () => {
    console.log(`Demo app running at http://localhost:${PORT}`);
    console.log(`MongoDB URI: ${MONGODB_URI}`);
  });

  while (!mongoReady) {
    try {
      await connectMongo();
    } catch (err) {
      setStatus("mongo", "error", { lastError: err.message });
      setStatus("changeStream", "waiting");
      emitEvent("error", {
        message: "MongoDB is not connected yet. Retrying in 3 seconds.",
        detail: err.message,
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  connectKafka().catch((err) => {
    kafkaReady = false;
    setStatus("kafka", "error", { lastError: err.message });
    emitEvent("kafka-error", {
      message: "Kafka is not connected yet. Start the broker and insert another order to retry.",
      detail: err.message,
    });
  });

  watchChangesForever();
}

process.on("SIGINT", async () => {
  await producer?.disconnect().catch(() => {});
  await mongoClient?.close().catch(() => {});
  process.exit(0);
});

start().catch((err) => {
  console.error(err);
  process.exit(1);
});