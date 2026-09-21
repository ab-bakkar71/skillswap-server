const { ObjectId } = require("mongodb");
const { getCollections } = require("../config/db");
const { isValidObjectId, escapeRegex } = require("../utils/helpers");

// Create Task
const createTask = async (req, res) => {
  try {
    const { taskCollection } = getCollections();
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
};

// Get Client Tasks
const getClientTasks = async (req, res) => {
  try {
    const { taskCollection } = getCollections();
    const email = req.params.email;

    if (!email) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }

    const reqEmail = req.headers["x-user-email"];
    const reqRole = req.headers["x-user-role"];
    if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
      return res.status(403).send({ success: false, message: "Forbidden: Cannot access other client tasks." });
    }

    const query = { clientEmail: email };
    const result = await taskCollection
      .find(query)
      .sort({ createdAt: -1, createAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Error fetching client tasks:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Get All Tasks with filters, search, sort, pagination
const getAllTasks = async (req, res) => {
  try {
    const { taskCollection } = getCollections();
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
};

// Get Task by ID
const getTaskById = async (req, res) => {
  try {
    const { taskCollection } = getCollections();
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
};

// Delete Task
const deleteTask = async (req, res) => {
  try {
    const { taskCollection } = getCollections();
    const id = req.params.id;

    if (!isValidObjectId(id)) {
      return res.status(400).send({ success: false, message: "Invalid Task ID format" });
    }

    const query = { _id: new ObjectId(id) };
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
};

// Edit Task
const updateTask = async (req, res) => {
  try {
    const { taskCollection } = getCollections();
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
};

// Featured Open Tasks
const getFeaturedTasks = async (req, res) => {
  try {
    const { taskCollection } = getCollections();
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
};

module.exports = {
  createTask,
  getClientTasks,
  getAllTasks,
  getTaskById,
  deleteTask,
  updateTask,
  getFeaturedTasks,
};
