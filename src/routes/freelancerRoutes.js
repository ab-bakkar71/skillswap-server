const express = require("express");
const router = express.Router();
const freelancerController = require("../controllers/freelancerController");
const { verifyInternalAuth } = require("../middlewares/auth");

router.get("/api/freelancer", freelancerController.getFreelancers);
router.get("/api/freelancer/:id", freelancerController.getFreelancerById);
router.patch("/api/freelancer/update/:email", verifyInternalAuth, freelancerController.updateFreelancer);

module.exports = router;
