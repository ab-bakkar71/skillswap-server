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

router.post(
  "/api/ai/summarize-proposal",
  verifyInternalAuth,
  writeRateLimiter(60),
  aiController.summarizeProposal
);

router.post(
  "/api/ai/summarize-task",
  verifyInternalAuth,
  writeRateLimiter(60),
  aiController.summarizeTask
);

module.exports = router;
