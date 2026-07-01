const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 8000;
var cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_DB_URI;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // await client.connect();
    const database = client.db("skill_swap");
    const taskCollection = database.collection("task");
    const userCollection = database.collection("user");
    const proposalCollection = database.collection("proposal");
    const paymentCollection = database.collection("payment");
    // post task api
    app.post("/api/task", async (req, res) => {
      const task = req.body;
      const newTask = {
        ...task,
        createAt: new Date(),
      };
      const result = await taskCollection.insertOne(newTask);
      res.send(result);
    });

    // client my task api
    app.get("/api/task/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        clientEmail: email,
      };
      const result = await taskCollection.find(query).toArray();
      res.send(result);
    });

    // Edit freelancer data api
    app.patch("/api/freelancer/update/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const updateData = req.body;
        const query = { email: email };

        const updateDoc = {
          $set: {
            name: updateData.name,
            image: updateData.image,
            skills: updateData.skills,
            bio: updateData.bio,
            hourlyRate: updateData.hourlyRate,
          },
        };
        const result = await userCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // all task api
    app.get("/api/tasks", async (req, res) => {
      const cursor = await taskCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // get task by id
    app.get("/api/tasks/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await taskCollection.findOne(query);
      res.send(result);
    });

    // get freelancer
    app.get("/api/freelancer", async (req, res) => {
      const query = { role: "freelancer" };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    // get freelancer by id
    app.get("/api/freelancer/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    // Dynamic Section 1 — Latest Featured Tasks
    app.get("/api/featured-task/open", async (req, res) => {
      const query = { status: "open" };
      const result = await taskCollection
        .find(query)
        .sort({ createAt: -1 })
        .limit(4)
        .toArray();
      res.json(result);
    });

    // proposal data post api
    app.post("/api/proposal", async (req, res) => {
      try {
        const proposal = req.body;

        const alreadySubmitted = await proposalCollection.findOne({
          taskId: proposal.taskId,
          freelancerEmail: proposal.freelancerEmail,
        });

        if (alreadySubmitted) {
          return res.status(400).send({
            success: false,
            message: "You have already submitted a proposal for this task.",
          });
        }

        const finalProposal = {
          ...proposal,
          createdAt: new Date(),
          status: "pending",
        };

        const result = await proposalCollection.insertOne(finalProposal);

        res.status(201).send({
          success: true,
          result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // proposal show on freelancer dashboard api
    app.get("/api/proposal/freelancer/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        freelancerEmail: email,
      };
      const result = await proposalCollection
        .find(query)
        .sort({ createAt: -1 })
        .toArray();
      res.send(result);
    });

    // proposal show on client dashboard api
    app.get("/api/proposal/client/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        clientEmail: email,
      };
      const result = await proposalCollection
        .find(query)
        .sort({ createAt: -1 })
        .toArray();
      res.send(result);
    });

    // proposal showing by task id
    app.get("/api/proposals/task/:taskId", async (req, res) => {
      const taskId = req.params.taskId;
      const query = { taskId: taskId };
      const result = await proposalCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    // active task
    app.get("/api/active-task/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        freelancerEmail: email,
        status: "accepted",
      };
      const result = await proposalCollection
        .find(query)
        .sort({ createAt: -1 })
        .toArray();
      res.send(result);
    });

    // get data statice
    app.get("/api/admin/dashboard-summary", async (req, res) => {
      const totalUsers = await userCollection.countDocuments();
      const totalTasks = await taskCollection.countDocuments();
      const activeTasks = await taskCollection.countDocuments({
        status: "in-progress",
      });

      const revenueData = await paymentCollection
        .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
        .toArray();
      const totalRevenue = revenueData[0]?.total || 0;

      res.send({
        totalUsers,
        totalTasks,
        activeTasks,
        totalRevenue,
      });
    });

    // admin user list api
    app.get("/api/admin/user", async (req, res) => {
      const users = await userCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      const safeUsers = users.map(({ password, ...rest }) => rest);
      res.send(safeUsers);
    });

    // payment
    app.post("/api/confirm-session", async (req, res) => {
      try {
        const {
          proposalId,
          taskId,
          taskTitle,
          clientName,
          clientEmail,
          freelancerName,
          amount,
          transactionId,
          paymentMethod,
          currency,
          paymentStatus,
        } = req.body;

        const paymentData = {
          proposalId,
          taskId,
          taskTitle,
          clientName,
          clientEmail,
          freelancerName,
          amount,
          transactionId,
          paymentMethod,
          currency,
          paymentStatus,
          paymentDate: new Date(),
        };

        isPaymentExist = await paymentCollection.findOne({ transactionId });
        if (isPaymentExist) {
          return res.status(200).send({ message: "Already Paid" });
        }
        // Save payment
        const paymentResult = await paymentCollection.insertOne(paymentData);

        // Update proposal status
        await proposalCollection.updateOne(
          { _id: new ObjectId(proposalId) },
          {
            $set: {
              status: "accepted",
            },
          },
        );

        // Update task status
        await taskCollection.updateOne(
          { _id: new ObjectId(taskId) },
          {
            $set: {
              status: "in-progress",
            },
          },
        );

        // reject other proposals for the same task
        await proposalCollection.updateMany(
          {
            taskId,
            _id: { $ne: new ObjectId(proposalId) },
          },
          {
            $set: {
              status: "rejected",
            },
          },
        );
        res.status(200).send({
          success: true,
          message: "Payment completed successfully",
          paymentId: paymentResult.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // delete task
    app.delete("/api/client/task/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await taskCollection.deleteOne(query);
      console.log(result);
      res.send(result);
    });

    // edit task
    app.patch("/api/client/update/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { title, budget, deadline, description } = req.body;
        const filter = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            title,
            budget,
            deadline,
            description,
          },
        };
        const result = await taskCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // reject Proposal
    app.patch("/api/proposal/reject/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const newStatus = "rejected";

        const updateDoc = {
          $set: {
            status: newStatus,
          },
        };
        const result = await proposalCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
