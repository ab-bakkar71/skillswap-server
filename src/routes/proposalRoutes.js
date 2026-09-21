const express = require("express");
const router = express.Router();
const proposalController = require("../controllers/proposalController");
const { verifyInternalAuth } = require("../middlewares/auth");
const { writeRateLimiter } = require("../middlewares/security");

router.post("/api/proposal", verifyInternalAuth, writeRateLimiter(60), proposalController.createProposal);
router.get("/api/proposal/freelancer/:email", verifyInternalAuth, proposalController.getFreelancerProposals);
router.get("/api/proposal/client/:email", verifyInternalAuth, proposalController.getClientProposals);
router.get("/api/proposals/task/:taskId", proposalController.getProposalsByTaskId);
router.get("/api/active-task/:email", verifyInternalAuth, proposalController.getActiveTasks);
router.patch("/api/proposal/reject/:id", verifyInternalAuth, proposalController.rejectProposal);
router.patch("/api/proposal/submit-work/:id", verifyInternalAuth, writeRateLimiter(60), proposalController.submitWork);
router.patch("/api/proposal/approve/:id", verifyInternalAuth, proposalController.approveWork);
router.patch("/api/proposal/revision/:id", verifyInternalAuth, proposalController.requestRevision);
router.patch("/api/proposal/complete/:id", verifyInternalAuth, proposalController.completeProposal);

module.exports = router;
