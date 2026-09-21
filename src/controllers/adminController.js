const { ObjectId } = require("mongodb");
const { getCollections } = require("../config/db");
const { isValidObjectId } = require("../utils/helpers");

// Admin dashboard statistics summary
const getDashboardSummary = async (req, res) => {
  try {
    const { userCollection, taskCollection, paymentCollection } = getCollections();

    const [totalUsers, totalTasks, activeTasks, revenueData] = await Promise.all([
      userCollection.countDocuments(),
      taskCollection.countDocuments(),
      taskCollection.countDocuments({ status: "in-progress" }),
      paymentCollection.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]).toArray(),
    ]);

    const totalRevenue = revenueData[0]?.total || 0;

    res.send({
      totalUsers,
      totalTasks,
      activeTasks,
      totalRevenue,
    });
  } catch (error) {
    console.error("Error fetching dashboard summary:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Admin user list
const getAdminUsers = async (req, res) => {
  try {
    const { userCollection } = getCollections();
    const users = await userCollection
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: -1, createAt: -1 })
      .toArray();

    res.send(users);
  } catch (error) {
    console.error("Error fetching admin users:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Admin payment list
const getAdminPayments = async (req, res) => {
  try {
    const { paymentCollection } = getCollections();
    const payments = await paymentCollection
      .find({})
      .sort({ paymentDate: -1, createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: payments,
    });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Block or Unblock User
const blockUser = async (req, res) => {
  try {
    const { userCollection } = getCollections();
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({ success: false, message: "Invalid User ID format" });
    }

    const { status } = req.body;
    if (!["block", "active"].includes(status)) {
      return res.status(400).send({
        success: false,
        message: "Invalid status. Must be 'block' or 'active'.",
      });
    }

    const result = await userCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "User not found",
      });
    }

    res.send({
      success: true,
      message: status === "block" ? "User blocked successfully." : "User unblocked successfully.",
      result,
    });
  } catch (error) {
    console.error("Error blocking/unblocking user:", error);
    res.status(500).send({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Update User Role
const updateUserRole = async (req, res) => {
  try {
    const { userCollection } = getCollections();
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({ success: false, message: "Invalid User ID format" });
    }

    const { role } = req.body;
    if (!["client", "freelancer", "admin"].includes(role)) {
      return res.status(400).send({
        success: false,
        message: "Invalid role. Must be 'client', 'freelancer', or 'admin'.",
      });
    }

    const result = await userCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          role,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "User not found",
      });
    }

    res.send({
      success: true,
      message: `User role updated to '${role}' successfully.`,
      result,
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).send({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

module.exports = {
  getDashboardSummary,
  getAdminUsers,
  getAdminPayments,
  blockUser,
  updateUserRole,
};
