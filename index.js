try {
  const dns = require("node:dns");
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (e) {
  // DNS override fallback
}

const express = require("express");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 8000;
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(cors({
  origin: [
    "http://localhost:3000",
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true
}));
app.use(express.json());

const uri = process.env.MONGO_DB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Helper to validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return Boolean(id && ObjectId.isValid(id) && String(new ObjectId(id)) === String(id));
};

async function run() {
  try {
    const database = client.db("skill_swap");
    const taskCollection = database.collection("task");
    const userCollection = database.collection("user");
    const proposalCollection = database.collection("proposal");
    const paymentCollection = database.collection("payment");

    // post task api
    app.post("/api/task", async (req, res) => {
      try {
        const task = req.body;
        if (!task.title || !task.clientEmail) {
          return res.status(400).send({
            success: false,
            message: "Title and Client Email are required.",
          });
        }

        const newTask = {
          ...task,
          createdAt: new Date(),
          createAt: new Date(),
        };
        const result = await taskCollection.insertOne(newTask);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // client my task api
    app.get("/api/task/:email", async (req, res) => {
      try {
        const email = req.params.email;
        if (!email) {
          return res.status(400).send({ success: false, message: "Email is required" });
        }
        const query = {
          clientEmail: email,
        };
        const result = await taskCollection
          .find(query)
          .sort({ createdAt: -1, createAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching client tasks:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
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
        console.error("Error updating freelancer:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // all task api
    app.get("/api/tasks", async (req, res) => {
      try {
        const query = { status: "open" };
        const cursor = await taskCollection
          .find(query)
          .sort({ createdAt: -1, createAt: -1 });
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching tasks:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // get task by id
    app.get("/api/tasks/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res.status(400).send({ success: false, message: "Invalid Task ID format" });
        }
        const query = { _id: new ObjectId(id) };
        const result = await taskCollection.findOne(query);
        if (!result) {
          return res.status(404).send({ success: false, message: "Task not found" });
        }
        res.send(result);
      } catch (error) {
        console.error("Error fetching task by id:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // get freelancer
    app.get("/api/freelancer", async (req, res) => {
      try {
        const query = { role: "freelancer" };
        const result = await userCollection
          .find(query, { projection: { password: 0 } })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching freelancers:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // get freelancer by id
    app.get("/api/freelancer/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res.status(400).send({ success: false, message: "Invalid Freelancer ID format" });
        }
        const query = { _id: new ObjectId(id) };
        const result = await userCollection.findOne(query, {
          projection: { password: 0 },
        });
        if (!result) {
          return res.status(404).send({ success: false, message: "Freelancer not found" });
        }
        res.send(result);
      } catch (error) {
        console.error("Error fetching freelancer by id:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // Dynamic Section 1 — Latest Featured Tasks
    app.get("/api/featured-task/open", async (req, res) => {
      try {
        const query = { status: "open" };
        const result = await taskCollection
          .find(query)
          .sort({ createdAt: -1, createAt: -1 })
          .limit(6)
          .toArray();
        res.json(result);
      } catch (error) {
        console.error("Error fetching featured tasks:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // proposal data post api
    app.post("/api/proposal", async (req, res) => {
      try {
        const proposal = req.body;

        if (!proposal.taskId || !proposal.freelancerEmail) {
          return res.status(400).send({
            success: false,
            message: "Task ID and Freelancer Email are required.",
          });
        }

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
          createAt: new Date(),
          status: "pending",
        };

        const result = await proposalCollection.insertOne(finalProposal);

        res.status(201).send({
          success: true,
          result,
        });
      } catch (error) {
        console.error("Error submitting proposal:", error);
        res.status(500).send({
          success: false,
          message: error.message || "Internal Server Error",
        });
      }
    });

    // proposal show on freelancer dashboard api
    app.get("/api/proposal/freelancer/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = {
          freelancerEmail: email,
        };
        const result = await proposalCollection
          .find(query)
          .sort({ createdAt: -1, createAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching freelancer proposals:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // proposal show on client dashboard api
    app.get("/api/proposal/client/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = {
          clientEmail: email,
        };
        const result = await proposalCollection
          .find(query)
          .sort({ createdAt: -1, createAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching client proposals:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // proposal showing by task id
    app.get("/api/proposals/task/:taskId", async (req, res) => {
      try {
        const taskId = req.params.taskId;
        const query = { taskId: taskId };
        const result = await proposalCollection
          .find(query)
          .sort({ createdAt: -1, createAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching proposals by taskId:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // active task
    app.get("/api/active-task/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = {
          freelancerEmail: email,
          status: "accepted",
        };
        const result = await proposalCollection
          .find(query)
          .sort({ createdAt: -1, createAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching active tasks:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // get admin dashboard statistics
    app.get("/api/admin/dashboard-summary", async (req, res) => {
      try {
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
      } catch (error) {
        console.error("Error fetching dashboard summary:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // admin user list api
    app.get("/api/admin/user", async (req, res) => {
      try {
        const users = await userCollection
          .find({}, { projection: { password: 0 } })
          .sort({ createdAt: -1, createAt: -1 })
          .toArray();
        res.send(users);
      } catch (error) {
        console.error("Error fetching admin users:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // payment confirmation
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

        if (!transactionId || !proposalId || !taskId) {
          return res.status(400).send({
            success: false,
            message: "Missing required payment fields.",
          });
        }

        if (!isValidObjectId(proposalId) || !isValidObjectId(taskId)) {
          return res.status(400).send({
            success: false,
            message: "Invalid proposal or task identifier.",
          });
        }

        const isPaymentExist = await paymentCollection.findOne({ transactionId });
        if (isPaymentExist) {
          return res.status(200).send({ success: true, message: "Already Paid" });
        }

        const paymentData = {
          proposalId,
          taskId,
          taskTitle,
          clientName,
          clientEmail,
          freelancerName,
          amount: Number(amount) || 0,
          transactionId,
          paymentMethod: paymentMethod || "card",
          currency: currency || "USD",
          paymentStatus: paymentStatus || "paid",
          paymentDate: new Date(),
          createdAt: new Date(),
        };

        // Save payment
        const paymentResult = await paymentCollection.insertOne(paymentData);

        // Update proposal status
        await proposalCollection.updateOne(
          { _id: new ObjectId(proposalId) },
          {
            $set: {
              status: "accepted",
              updatedAt: new Date(),
            },
          }
        );

        // Update task status
        await taskCollection.updateOne(
          { _id: new ObjectId(taskId) },
          {
            $set: {
              status: "in-progress",
              updatedAt: new Date(),
            },
          }
        );

        // reject other proposals for the same task
        await proposalCollection.updateMany(
          {
            taskId: taskId,
            _id: { $ne: new ObjectId(proposalId) },
          },
          {
            $set: {
              status: "rejected",
              updatedAt: new Date(),
            },
          }
        );

        res.status(200).send({
          success: true,
          message: "Payment completed successfully",
          paymentId: paymentResult.insertedId,
        });
      } catch (error) {
        console.error("Payment confirmation error:", error);
        res.status(500).send({
          success: false,
          message: error.message || "Internal Server Error",
        });
      }
    });

    // delete task
    app.delete("/api/client/task/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res.status(400).send({ success: false, message: "Invalid Task ID format" });
        }
        const query = {
          _id: new ObjectId(id),
        };
        const result = await taskCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // edit task
    app.patch("/api/client/update/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res.status(400).send({ success: false, message: "Invalid Task ID format" });
        }
        const { title, budget, deadline, description, category } = req.body;
        const filter = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            title,
            budget: Number(budget) || budget,
            deadline,
            description,
            ...(category ? { category } : {}),
            updatedAt: new Date(),
          },
        };
        const result = await taskCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // reject Proposal
    app.patch("/api/proposal/reject/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res.status(400).send({ success: false, message: "Invalid Proposal ID format" });
        }
        const filter = { _id: new ObjectId(id) };
        const newStatus = "rejected";

        const updateDoc = {
          $set: {
            status: newStatus,
            updatedAt: new Date(),
          },
        };
        const result = await proposalCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error rejecting proposal:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // complete task
    app.patch("/api/proposal/complete/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
          return res.status(400).send({ success: false, message: "Invalid Proposal ID format" });
        }
        const { deliverableUrl } = req.body;

        const proposal = await proposalCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!proposal) {
          return res.status(404).send({
            success: false,
            message: "Proposal not found",
          });
        }

        // Proposal update
        await proposalCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "completed",
              deliverableUrl,
              completedAt: new Date(),
              updatedAt: new Date(),
            },
          }
        );

        // Related Task update
        if (isValidObjectId(proposal.taskId)) {
          await taskCollection.updateOne(
            { _id: new ObjectId(proposal.taskId) },
            {
              $set: {
                status: "completed",
                updatedAt: new Date(),
              },
            }
          );
        }

        res.send({
          success: true,
          message: "Task marked as completed successfully.",
        });
      } catch (error) {
        console.error("Error completing proposal:", error);
        res.status(500).send({
          success: false,
          message: error.message || "Internal Server Error",
        });
      }
    });

    // user block api
    app.patch("/api/users/block/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
          return res.status(400).send({ success: false, message: "Invalid User ID format" });
        }
        const { status } = req.body;

        if (!["block", "active"].includes(status)) {
          return res.status(400).send({
            success: false,
            message: "Invalid status. Must be 'block' or 'active'.",
          });
        }

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        res.send({
          success: true,
          message:
            status === "block"
              ? "User blocked successfully."
              : "User unblocked successfully.",
          result,
        });
      } catch (error) {
        console.error("Error blocking/unblocking user:", error);
        res.status(500).send({
          success: false,
          message: error.message || "Internal Server Error",
        });
      }
    });

    // user role update api
    app.patch("/api/users/role/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
          return res.status(400).send({ success: false, message: "Invalid User ID format" });
        }
        const { role } = req.body;

        if (!["client", "freelancer", "admin"].includes(role)) {
          return res.status(400).send({
            success: false,
            message: "Invalid role. Must be 'client', 'freelancer', or 'admin'.",
          });
        }

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              role,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        res.send({
          success: true,
          message: `User role updated to '${role}' successfully.`,
          result,
        });
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).send({
          success: false,
          message: error.message || "Internal Server Error",
        });
      }
    });

    // admin payment list api
    app.get("/api/admin/payment", async (req, res) => {
      try {
        const payments = await paymentCollection
          .find({})
          .sort({ paymentDate: -1, createdAt: -1 })
          .toArray();
        res.send({
          success: true,
          data: payments,
        });
      } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (error) {
    console.error("Database connection / setup error:", error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("SkillSwap API Server is running smoothly.");
});

app.listen(port, () => {
  console.log(`SkillSwap server listening on port ${port}`);
});
