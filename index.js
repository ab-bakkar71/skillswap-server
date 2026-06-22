const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const app = express();
require("dotenv").config();
const port = process.env.PORT || 8000;
var cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');

app.use(cors());
app.use(express.json());


const uri = process.env.MONGO_DB_URI
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // await client.connect();
    const database = client.db("skill_swap");
    const taskCollection = database.collection("task");
    // post task api
    app.post("/api/task", async(req, res)=>{
      const task = req.body
      const newTask ={
        ...task,
        createAt: new Date()
      }
      const result = await taskCollection.insertOne(newTask);
      res.send(result);
    })




    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});