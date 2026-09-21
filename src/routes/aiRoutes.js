const express = require("express");
const router = express.Router();
const aiController = require("../controllers/aiController");
const { verifyInternalAuth } = require("../middlewares/auth");
const { writeRateLimiter } = require("../middlewares/security");

// AI assistant endpoints (protected with internal auth and rate limiting)
router.post(
  "/api/ai/generate-task",
  verifyInternalAuth,
  writeRateLimiter(60),
  aiController.generateTask
);

router.post(
  "/api/ai/generate-proposal",
  verifyInternalAuth,
  writeRateLimiter(60),
  aiController.generateProposal
);

module.exports = router;
