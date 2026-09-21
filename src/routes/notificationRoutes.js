const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { verifyInternalAuth } = require("../middlewares/auth");

// Notification routes protected with internal auth
router.get(
  "/api/notifications/:email",
  verifyInternalAuth,
  notificationController.getUserNotifications
);

router.patch(
  "/api/notifications/read/:id",
  verifyInternalAuth,
  notificationController.markAsRead
);

router.patch(
  "/api/notifications/read-all/:email",
  verifyInternalAuth,
  notificationController.markAllAsRead
);

module.exports = router;
