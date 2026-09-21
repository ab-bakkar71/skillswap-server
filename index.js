try {
  const dns = require("node:dns");
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (e) {
  // DNS override fallback
}

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB, closeDB } = require("./src/config/db");
const { securityHeaders } = require("./src/middlewares/security");
const errorHandler = require("./src/middlewares/errorHandler");

// Import modular routes
const taskRoutes = require("./src/routes/taskRoutes");
const freelancerRoutes = require("./src/routes/freelancerRoutes");
const proposalRoutes = require("./src/routes/proposalRoutes");
const paymentRoutes = require("./src/routes/paymentRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const reviewRoutes = require("./src/routes/reviewRoutes");
const aiRoutes = require("./src/routes/aiRoutes");

const app = express();
const port = process.env.PORT || 8000;

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      process.env.CLIENT_URL,
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true,
  })
);

// Standard & Security Middlewares
app.use(securityHeaders);
app.use(express.json());

// Mount API routes
app.use(taskRoutes);
app.use(freelancerRoutes);
app.use(proposalRoutes);
app.use(paymentRoutes);
app.use(adminRoutes);
app.use(reviewRoutes);
app.use(aiRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: "SkillSwap Server",
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("SkillSwap API Server is running smoothly.");
});

// Global Express error handler
app.use(errorHandler);

let server;

// Start Server and Connect Database
const startServer = async () => {
  try {
    await connectDB();
    server = app.listen(port, () => {
      console.log(`SkillSwap server listening on port ${port}`);
    });
  } catch (error) {
    console.error("Database connection / setup error:", error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown handling
const gracefulShutdown = async () => {
  console.log("Shutting down gracefully...");
  if (server) {
    server.close(async () => {
      try {
        await closeDB();
        process.exit(0);
      } catch (e) {
        console.error("Error closing MongoDB connection:", e);
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

module.exports = app;
