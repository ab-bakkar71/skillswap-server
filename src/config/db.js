const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = process.env.MONGO_DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db = null;
let collections = {};

async function initIndexes(database) {
  try {
    const taskCollection = database.collection("task");
    const userCollection = database.collection("user");
    const proposalCollection = database.collection("proposal");
    const paymentCollection = database.collection("payment");
    const reviewCollection = database.collection("review");

    await Promise.allSettled([
      taskCollection.createIndex({ clientEmail: 1 }),
      taskCollection.createIndex({ status: 1, createdAt: -1 }),
      taskCollection.createIndex({ category: 1 }),
      userCollection.createIndex({ email: 1 }, { unique: true, sparse: true }),
      userCollection.createIndex({ role: 1 }),
      proposalCollection.createIndex({ freelancerEmail: 1 }),
      proposalCollection.createIndex({ clientEmail: 1 }),
      proposalCollection.createIndex({ taskId: 1 }),
      proposalCollection.createIndex({ status: 1 }),
      paymentCollection.createIndex({ transactionId: 1 }, { unique: true, sparse: true }),
      paymentCollection.createIndex({ clientEmail: 1 }),
      paymentCollection.createIndex({ freelancerEmail: 1 }),
      paymentCollection.createIndex({ proposalId: 1 }),
      paymentCollection.createIndex({ taskId: 1 }),
      reviewCollection.createIndex({ freelancerEmail: 1 }),
      reviewCollection.createIndex({ clientEmail: 1 }),
      reviewCollection.createIndex({ proposalId: 1 }, { unique: true, sparse: true }),
      reviewCollection.createIndex({ taskId: 1 }),
    ]);
  } catch (err) {
    console.warn("Index initialization notice:", err.message);
  }
}

async function connectDB() {
  if (db) return { db, collections, client };

  await client.connect();
  db = client.db("skill_swap");

  collections = {
    taskCollection: db.collection("task"),
    userCollection: db.collection("user"),
    proposalCollection: db.collection("proposal"),
    paymentCollection: db.collection("payment"),
    reviewCollection: db.collection("review"),
  };

  await initIndexes(db);
  console.log("Pinged your deployment. You successfully connected to MongoDB!");

  return { db, collections, client };
}

function getDB() {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB first.");
  }
  return db;
}

function getCollections() {
  if (!collections || !collections.taskCollection) {
    throw new Error("Collections not initialized. Call connectDB first.");
  }
  return collections;
}

async function closeDB() {
  if (client) {
    await client.close();
    console.log("MongoDB connection closed.");
  }
}

module.exports = {
  client,
  connectDB,
  getDB,
  getCollections,
  closeDB,
};
