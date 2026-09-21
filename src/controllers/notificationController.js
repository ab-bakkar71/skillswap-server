const { ObjectId } = require("mongodb");
const { getCollections } = require("../config/db");
const { isValidObjectId } = require("../utils/helpers");

/**
 * Internal helper to create a notification safely
 */
const createNotification = async ({
  recipientEmail,
  senderEmail = "",
  senderName = "",
  title,
  message,
  link = "",
  type = "general",
}) => {
  if (!recipientEmail || !title || !message) {
    return null;
  }

  try {
    const { notificationCollection } = getCollections();
    const notificationDoc = {
      recipientEmail: recipientEmail.toLowerCase().trim(),
      senderEmail: (senderEmail || "").toLowerCase().trim(),
      senderName: senderName || "SkillSwap Platform",
      title: title.trim(),
      message: message.trim(),
      link: link || "",
      type,
      isRead: false,
      createdAt: new Date(),
    };

    const result = await notificationCollection.insertOne(notificationDoc);
    return { ...notificationDoc, _id: result.insertedId };
  } catch (err) {
    console.error("Failed to create notification:", err.message);
    return null;
  }
};

/**
 * GET /api/notifications/:email
 * Fetch notifications for a user and count unread
 */
const getUserNotifications = async (req, res) => {
  try {
    const { email } = req.params;
    const reqEmail = req.headers["x-user-email"];
    const reqRole = req.headers["x-user-role"];

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Security check: only own email or admin
    if (reqRole !== "admin" && reqEmail && reqEmail.toLowerCase().trim() !== normalizedEmail) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Cannot access notifications for another user",
      });
    }

    const { notificationCollection } = getCollections();

    // Fetch latest 30 notifications
    const notifications = await notificationCollection
      .find({ recipientEmail: normalizedEmail })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray();

    // Count unread
    const unreadCount = await notificationCollection.countDocuments({
      recipientEmail: normalizedEmail,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error fetching notifications",
    });
  }
};

/**
 * PATCH /api/notifications/read/:id
 * Mark a single notification as read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid Notification ID" });
    }

    const { notificationCollection } = getCollections();
    const result = await notificationCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isRead: true, readAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error updating notification",
    });
  }
};

/**
 * PATCH /api/notifications/read-all/:email
 * Mark all notifications for a user as read
 */
const markAllAsRead = async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const reqEmail = req.headers["x-user-email"];
    const reqRole = req.headers["x-user-role"];

    if (reqRole !== "admin" && reqEmail && reqEmail.toLowerCase().trim() !== normalizedEmail) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Cannot update notifications for another user",
      });
    }

    const { notificationCollection } = getCollections();
    const result = await notificationCollection.updateMany(
      { recipientEmail: normalizedEmail, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    return res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error updating notifications",
    });
  }
};

module.exports = {
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
};
