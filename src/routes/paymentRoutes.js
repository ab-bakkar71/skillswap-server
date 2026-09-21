const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { verifyInternalAuth } = require("../middlewares/auth");
const { writeRateLimiter } = require("../middlewares/security");

router.post("/api/confirm-session", verifyInternalAuth, writeRateLimiter(60), paymentController.confirmSession);
router.get("/api/payment/client/:email", verifyInternalAuth, paymentController.getClientPayments);
router.get("/api/payment/freelancer/:email", verifyInternalAuth, paymentController.getFreelancerPayments);

module.exports = router;
