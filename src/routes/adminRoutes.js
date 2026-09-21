const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { requireAdminAuth } = require("../middlewares/auth");

router.get("/api/admin/dashboard-summary", requireAdminAuth, adminController.getDashboardSummary);
router.get("/api/admin/user", requireAdminAuth, adminController.getAdminUsers);
router.get("/api/admin/payment", requireAdminAuth, adminController.getAdminPayments);
router.patch("/api/users/block/:id", requireAdminAuth, adminController.blockUser);
router.patch("/api/users/role/:id", requireAdminAuth, adminController.updateUserRole);

module.exports = router;
