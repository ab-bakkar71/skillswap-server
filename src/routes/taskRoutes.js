const express = require("express");
const router = express.Router();
const taskController = require("../controllers/taskController");
const { verifyInternalAuth } = require("../middlewares/auth");
const { writeRateLimiter } = require("../middlewares/security");

// Task endpoints
router.post("/api/task", verifyInternalAuth, writeRateLimiter(60), taskController.createTask);
router.get("/api/task/:email", verifyInternalAuth, taskController.getClientTasks);
router.get("/api/tasks", taskController.getAllTasks);
router.get("/api/tasks/:id", taskController.getTaskById);
router.delete("/api/client/task/:id", verifyInternalAuth, taskController.deleteTask);
router.patch("/api/client/update/:id", verifyInternalAuth, taskController.updateTask);
router.get("/api/featured-task/open", taskController.getFeaturedTasks);

module.exports = router;
