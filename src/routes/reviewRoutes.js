const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const { verifyInternalAuth } = require("../middlewares/auth");
const { writeRateLimiter } = require("../middlewares/security");

// Review routes
router.post("/api/reviews", verifyInternalAuth, writeRateLimiter(60), reviewController.createReview);
router.get("/api/reviews/freelancer/:email", reviewController.getFreelancerReviews);
router.get("/api/reviews/proposal/:proposalId", verifyInternalAuth, reviewController.getProposalReview);

module.exports = router;
