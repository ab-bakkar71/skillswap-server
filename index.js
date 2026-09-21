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

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// Lightweight In-Memory Rate Limiter for write endpoints
const rateLimitMap = new Map();
const writeRateLimiter = (maxRequests = 100, windowMs = 60000) => {
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const key = `${ip}:${req.baseUrl || req.path}`;
    const now = Date.now();
    const record = rateLimitMap.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count += 1;
    }
    rateLimitMap.set(key, record);

    if (record.count > maxRequests) {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again in a minute.",
      });
    }
    next();
  };
};

// Cleanup rate limit records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetTime) rateLimitMap.delete(key);
  }
}, 300000);

// Helper to escape regex special characters (prevent ReDoS / regex injection)
const escapeRegex = (string) => {
  if (typeof string !== "string") return "";
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Internal Authentication & Authorization Guards
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || "skillswap_super_secret_internal_key_2026";

const verifyInternalAuth = (req, res, next) => {
  const secret = req.headers["x-internal-secret"];
  if (secret && secret === INTERNAL_SECRET) {
    return next();
  }
  return res.status(401).json({
    success: false,
    message: "Unauthorized: Invalid or missing authentication credentials.",
  });
};

const requireAdminAuth = (req, res, next) => {
  const secret = req.headers["x-internal-secret"];
  const userRole = req.headers["x-user-role"];

  if (secret === INTERNAL_SECRET && userRole === "admin") {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Forbidden: Administrator privileges required.",
  });
};

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

async function initIndexes(database) {
  try {
    const taskCollection = database.collection("task");
    const userCollection = database.collection("user");
    const proposalCollection = database.collection("proposal");
    const paymentCollection = database.collection("payment");

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
    ]);
  } catch (err) {
    console.warn("Index initialization notice:", err.message);
  }
}

async function run() {
  try {
    const database = client.db("skill_swap");
    const taskCollection = database.collection("task");
    const userCollection = database.collection("user");
    const proposalCollection = database.collection("proposal");
    const paymentCollection = database.collection("payment");

    // Initialize database indexes for performance optimization
    await initIndexes(database);

    // post task api
    app.post("/api/task", verifyInternalAuth, writeRateLimiter(60), async (req, res) => {
      try {
        const task = req.body;
        if (!task.title || !task.clientEmail) {
          return res.status(400).send({
            success: false,
            message: "Title and Client Email are required.",
          });
        }

        const parsedBudget = Number(task.budget);
        if (isNaN(parsedBudget) || parsedBudget <= 0) {
          return res.status(400).send({
            success: false,
            message: "Budget must be a valid positive number.",
          });
        }

        const userEmail = req.headers["x-user-email"];
        if (userEmail && task.clientEmail !== userEmail) {
          return res.status(403).send({
            success: false,
            message: "Forbidden: Cannot post task for another user.",
          });
        }

        const newTask = {
          ...task,
          budget: parsedBudget,
          status: task.status || "open",
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
    app.get("/api/task/:email", verifyInternalAuth, async (req, res) => {
      try {
        const email = req.params.email;
        if (!email) {
          return res.status(400).send({ success: false, message: "Email is required" });
        }

        const reqEmail = req.headers["x-user-email"];
        const reqRole = req.headers["x-user-role"];
        if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
          return res.status(403).send({ success: false, message: "Forbidden: Cannot access other client tasks." });
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
    app.patch("/api/freelancer/update/:email", verifyInternalAuth, async (req, res) => {
      try {
        const email = req.params.email;
        const updateData = req.body;

        const reqEmail = req.headers["x-user-email"];
        const reqRole = req.headers["x-user-role"];
        if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
          return res.status(403).send({ success: false, message: "Forbidden: Cannot update other freelancer profiles." });
        }

        const query = { email: email };

        const updateDoc = {
          $set: {
            name: updateData.name,
            image: updateData.image,
            skills: updateData.skills,
            bio: updateData.bio,
            hourlyRate: updateData.hourlyRate,
            updatedAt: new Date(),
          },
        };
        const result = await userCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating freelancer:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // all task api with query support (search, category, sort, pagination)
    app.get("/api/tasks", async (req, res) => {
      try {
        const { search, category, sort, page, limit } = req.query;
        const query = { status: "open" };

        if (category && typeof category === "string" && category !== "all") {
          const cleanCategory = escapeRegex(category.trim());
          query.category = { $regex: new RegExp(`^${cleanCategory}$`, "i") };
        }

        if (search && typeof search === "string" && search.trim()) {
          const cleanSearch = escapeRegex(search.trim());
          query.$or = [
            { title: { $regex: cleanSearch, $options: "i" } },
            { description: { $regex: cleanSearch, $options: "i" } },
            { category: { $regex: cleanSearch, $options: "i" } },
          ];
        }

        let sortOption = { createdAt: -1, createAt: -1 };
        if (sort === "budget-desc") {
          sortOption = { budget: -1 };
        } else if (sort === "budget-asc") {
          sortOption = { budget: 1 };
        }

        let cursor = taskCollection.find(query).sort(sortOption);

        if (page && limit) {
          const skip = (Number(page) - 1) * Number(limit);
          cursor = cursor.skip(skip).limit(Number(limit));
        }

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

    // get freelancer with optional search, skill, sort & pagination
    app.get("/api/freelancer", async (req, res) => {
      try {
        const { search, skill, sort, page, limit } = req.query;
        const query = { role: "freelancer" };

        if (skill && typeof skill === "string" && skill !== "All") {
          const cleanSkill = escapeRegex(skill.trim());
          query.skills = { $regex: new RegExp(cleanSkill, "i") };
        }

        if (search && typeof search === "string" && search.trim()) {
          const cleanSearch = escapeRegex(search.trim());
          query.$or = [
            { name: { $regex: cleanSearch, $options: "i" } },
            { bio: { $regex: cleanSearch, $options: "i" } },
            { skills: { $regex: cleanSearch, $options: "i" } },
          ];
        }

        let sortOption = { createdAt: -1, createAt: -1 };
        if (sort === "rate-desc") {
          sortOption = { hourlyRate: -1 };
        } else if (sort === "rate-asc") {
          sortOption = { hourlyRate: 1 };
        }

        let cursor = userCollection.find(query, { projection: { password: 0 } }).sort(sortOption);

        if (page && limit) {
          const skip = (Number(page) - 1) * Number(limit);
          cursor = cursor.skip(skip).limit(Number(limit));
        }

        const result = await cursor.toArray();
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
    app.post("/api/proposal", verifyInternalAuth, writeRateLimiter(60), async (req, res) => {
      try {
        const proposal = req.body;

        if (!proposal.taskId || !proposal.freelancerEmail) {
          return res.status(400).send({
            success: false,
            message: "Task ID and Freelancer Email are required.",
          });
        }

        if (proposal.proposedBudget !== undefined) {
          const parsedProposed = Number(proposal.proposedBudget);
          if (isNaN(parsedProposed) || parsedProposed <= 0) {
            return res.status(400).send({
              success: false,
              message: "Proposed budget must be a valid positive number.",
            });
          }
        }

        const userEmail = req.headers["x-user-email"];
        if (userEmail && proposal.freelancerEmail !== userEmail) {
          return res.status(403).send({
            success: false,
            message: "Forbidden: Cannot submit proposal for another user.",
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
    app.get("/api/proposal/freelancer/:email", verifyInternalAuth, async (req, res) => {
      try {
        const email = req.params.email;
        const reqEmail = req.headers["x-user-email"];
        const reqRole = req.headers["x-user-role"];
        if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
          return res.status(403).send({ success: false, message: "Forbidden: Cannot access other freelancer proposals." });
        }

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
    app.get("/api/proposal/client/:email", verifyInternalAuth, async (req, res) => {
      try {
        const email = req.params.email;
        const reqEmail = req.headers["x-user-email"];
        const reqRole = req.headers["x-user-role"];
        if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
          return res.status(403).send({ success: false, message: "Forbidden: Cannot access other client proposals." });
        }

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

    // proposal showing by task id (public for task applicants / task view)
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
    app.get("/api/active-task/:email", verifyInternalAuth, async (req, res) => {
      try {
        const email = req.params.email;
        const reqEmail = req.headers["x-user-email"];
        const reqRole = req.headers["x-user-role"];
        if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
          return res.status(403).send({ success: false, message: "Forbidden: Cannot access other active tasks." });
        }

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
    app.get("/api/admin/dashboard-summary", requireAdminAuth, async (req, res) => {
      try {
        const [totalUsers, totalTasks, activeTasks, revenueData] = await Promise.all([
          userCollection.countDocuments(),
          taskCollection.countDocuments(),
          taskCollection.countDocuments({ status: "in-progress" }),
          paymentCollection.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]).toArray()
        ]);

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
    app.get("/api/admin/user", requireAdminAuth, async (req, res) => {
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
    app.post("/api/confirm-session", verifyInternalAuth, writeRateLimiter(60), async (req, res) => {
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

        let fEmail = req.body.freelancerEmail;
        if (!fEmail && isValidObjectId(proposalId)) {
          const prop = await proposalCollection.findOne({ _id: new ObjectId(proposalId) });
          if (prop?.freelancerEmail) {
            fEmail = prop.freelancerEmail;
          }
        }

        const paymentData = {
          proposalId,
          taskId,
          taskTitle,
          clientName,
          clientEmail,
          freelancerName,
          freelancerEmail: fEmail || "",
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
    app.delete("/api/client/task/:id", verifyInternalAuth, async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res.status(400).send({ success: false, message: "Invalid Task ID format" });
        }
        const query = {
          _id: new ObjectId(id),
        };

        const existingTask = await taskCollection.findOne(query);
        if (!existingTask) {
          return res.status(404).send({ success: false, message: "Task not found" });
        }

        const requestingUserEmail = req.headers["x-user-email"] || req.body?.clientEmail;
        const userRole = req.headers["x-user-role"] || req.body?.userRole;

        if (userRole !== "admin" && requestingUserEmail && existingTask.clientEmail !== requestingUserEmail) {
          return res.status(403).send({ success: false, message: "Forbidden: You do not have permission to delete this task." });
        }

        const result = await taskCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // edit task
    app.patch("/api/client/update/:id", verifyInternalAuth, async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res.status(400).send({ success: false, message: "Invalid Task ID format" });
        }
        const { title, budget, deadline, description, category } = req.body;
        const filter = { _id: new ObjectId(id) };

        const existingTask = await taskCollection.findOne(filter);
        if (!existingTask) {
          return res.status(404).send({ success: false, message: "Task not found" });
        }

        const requestingUserEmail = req.headers["x-user-email"] || req.body?.clientEmail;
        const userRole = req.headers["x-user-role"] || req.body?.userRole;

        if (userRole !== "admin" && requestingUserEmail && existingTask.clientEmail !== requestingUserEmail) {
          return res.status(403).send({ success: false, message: "Forbidden: You do not have permission to edit this task." });
        }

        let parsedBudget = existingTask.budget;
        if (budget !== undefined) {
          parsedBudget = Number(budget);
          if (isNaN(parsedBudget) || parsedBudget <= 0) {
            return res.status(400).send({ success: false, message: "Budget must be a valid positive number." });
          }
        }

        const updateDoc = {
          $set: {
            title: title || existingTask.title,
            budget: parsedBudget,
            deadline: deadline !== undefined ? deadline : existingTask.deadline,
            description: description || existingTask.description,
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
    app.patch("/api/proposal/reject/:id", verifyInternalAuth, async (req, res) => {
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
    app.patch("/api/proposal/complete/:id", verifyInternalAuth, async (req, res) => {
      try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
          return res.status(400).send({ success: false, message: "Invalid Proposal ID format" });
        }
        const { deliverableUrl } = req.body;

        if (!deliverableUrl || typeof deliverableUrl !== "string" || !deliverableUrl.trim().startsWith("http")) {
          return res.status(400).send({
            success: false,
            message: "A valid deliverable URL starting with http:// or https:// is required.",
          });
        }

        const proposal = await proposalCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!proposal) {
          return res.status(404).send({
            success: false,
            message: "Proposal not found",
          });
        }

        const reqEmail = req.headers["x-user-email"] || req.body?.freelancerEmail;
        const reqRole = req.headers["x-user-role"];
        if (reqRole !== "admin" && reqEmail && proposal.freelancerEmail !== reqEmail) {
          return res.status(403).send({ success: false, message: "Forbidden: You can only complete your own assigned proposals." });
        }

        // Proposal update
        await proposalCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "completed",
              deliverableUrl: deliverableUrl.trim(),
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

    // user block api (admin only)
    app.patch("/api/users/block/:id", requireAdminAuth, async (req, res) => {
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

    // user role update api (admin only)
    app.patch("/api/users/role/:id", requireAdminAuth, async (req, res) => {
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

    // admin payment list api (admin only)
    app.get("/api/admin/payment", requireAdminAuth, async (req, res) => {
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

    // client payment history api
    app.get("/api/payment/client/:email", verifyInternalAuth, async (req, res) => {
      try {
        const email = req.params.email;
        if (!email) {
          return res.status(400).send({ success: false, message: "Email is required" });
        }

        const reqEmail = req.headers["x-user-email"];
        const reqRole = req.headers["x-user-role"];
        if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
          return res.status(403).send({ success: false, message: "Forbidden: Cannot access other client payments." });
        }

        const payments = await paymentCollection
          .find({ clientEmail: email })
          .sort({ paymentDate: -1, createdAt: -1 })
          .toArray();
        res.send({
          success: true,
          data: payments,
        });
      } catch (error) {
        console.error("Error fetching client payments:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    // freelancer earnings & payment history api
    app.get("/api/payment/freelancer/:email", verifyInternalAuth, async (req, res) => {
      try {
        const email = req.params.email;
        if (!email) {
          return res.status(400).send({ success: false, message: "Email is required" });
        }

        const reqEmail = req.headers["x-user-email"];
        const reqRole = req.headers["x-user-role"];
        if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
          return res.status(403).send({ success: false, message: "Forbidden: Cannot access other freelancer earnings." });
        }

        // Find freelancer proposals to match payments by proposalId, taskId or direct freelancerEmail
        const freelancerProposals = await proposalCollection
          .find({ freelancerEmail: email })
          .toArray();
        const proposalIds = freelancerProposals.map((p) => String(p._id));
        const taskIds = freelancerProposals.map((p) => String(p.taskId));

        const payments = await paymentCollection
          .find({
            $or: [
              { freelancerEmail: email },
              { proposalId: { $in: proposalIds } },
              { taskId: { $in: taskIds } },
            ],
          })
          .sort({ paymentDate: -1, createdAt: -1 })
          .toArray();

        res.send({
          success: true,
          data: payments,
        });
      } catch (error) {
        console.error("Error fetching freelancer payments:", error);
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

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: "SkillSwap Server"
  });
});

app.get("/", (req, res) => {
  res.send("SkillSwap API Server is running smoothly.");
});

// Express global error handler
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

const server = app.listen(port, () => {
  console.log(`SkillSwap server listening on port ${port}`);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log("Shutting down gracefully...");
  server.close(async () => {
    try {
      await client.close();
      console.log("MongoDB connection closed.");
      process.exit(0);
    } catch (e) {
      console.error("Error closing MongoDB connection:", e);
      process.exit(1);
    }
  });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
