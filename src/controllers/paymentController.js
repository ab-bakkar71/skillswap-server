const { ObjectId } = require("mongodb");
const { getCollections } = require("../config/db");
const { isValidObjectId } = require("../utils/helpers");
const { createNotification } = require("./notificationController");

// Payment confirmation
const confirmSession = async (req, res) => {
  try {
    const { paymentCollection, proposalCollection, taskCollection } = getCollections();
    const {
      proposalId,
      taskId,
      taskTitle,
      clientName,
      clientEmail,
      freelancerName,
      amount,
      transactionId,
      paymentMethod,
      currency,
      paymentStatus,
    } = req.body;

    if (!transactionId || !proposalId || !taskId) {
      return res.status(400).send({
        success: false,
        message: "Missing required payment fields.",
      });
    }

    if (!isValidObjectId(proposalId) || !isValidObjectId(taskId)) {
      return res.status(400).send({
        success: false,
        message: "Invalid proposal or task identifier.",
      });
    }

    const isPaymentExist = await paymentCollection.findOne({ transactionId });
    if (isPaymentExist) {
      return res.status(200).send({ success: true, message: "Already Paid" });
    }

    let fEmail = req.body.freelancerEmail;
    if (!fEmail && isValidObjectId(proposalId)) {
      const prop = await proposalCollection.findOne({ _id: new ObjectId(proposalId) });
      if (prop?.freelancerEmail) {
        fEmail = prop.freelancerEmail;
      }
    }

    const paymentData = {
      proposalId,
      taskId,
      taskTitle,
      clientName,
      clientEmail,
      freelancerName,
      freelancerEmail: fEmail || "",
      amount: Number(amount) || 0,
      transactionId,
      paymentMethod: paymentMethod || "card",
      currency: currency || "USD",
      paymentStatus: paymentStatus || "paid",
      paymentDate: new Date(),
      createdAt: new Date(),
    };

    // Save payment
    const paymentResult = await paymentCollection.insertOne(paymentData);

    // Update proposal status
    await proposalCollection.updateOne(
      { _id: new ObjectId(proposalId) },
      {
        $set: {
          status: "accepted",
          updatedAt: new Date(),
        },
      }
    );

    // Update task status
    await taskCollection.updateOne(
      { _id: new ObjectId(taskId) },
      {
        $set: {
          status: "in-progress",
          updatedAt: new Date(),
        },
      }
    );

    // Reject other proposals for the same task
    await proposalCollection.updateMany(
      {
        taskId: taskId,
        _id: { $ne: new ObjectId(proposalId) },
      },
      {
        $set: {
          status: "rejected",
          updatedAt: new Date(),
        },
      }
    );

    // Notify hired freelancer
    if (paymentData.freelancerEmail) {
      createNotification({
        recipientEmail: paymentData.freelancerEmail,
        senderEmail: paymentData.clientEmail,
        senderName: paymentData.clientName || "Client",
        title: "You're Hired! 🚀",
        message: `${paymentData.clientName || "Client"} accepted your proposal and funded $${paymentData.amount} for "${paymentData.taskTitle}". You can now start working!`,
        link: `/dashboard/freelancer/active-project`,
        type: "proposal_accepted",
      }).catch(() => {});
    }

    res.status(200).send({
      success: true,
      message: "Payment completed successfully",
      paymentId: paymentResult.insertedId,
    });
  } catch (error) {
    console.error("Payment confirmation error:", error);
    res.status(500).send({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Client payment history
const getClientPayments = async (req, res) => {
  try {
    const { paymentCollection } = getCollections();
    const email = req.params.email;

    if (!email) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }

    const reqEmail = req.headers["x-user-email"];
    const reqRole = req.headers["x-user-role"];
    if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
      return res.status(403).send({ success: false, message: "Forbidden: Cannot access other client payments." });
    }

    const payments = await paymentCollection
      .find({ clientEmail: email })
      .sort({ paymentDate: -1, createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: payments,
    });
  } catch (error) {
    console.error("Error fetching client payments:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Freelancer earnings & payment history
const getFreelancerPayments = async (req, res) => {
  try {
    const { paymentCollection, proposalCollection } = getCollections();
    const email = req.params.email;

    if (!email) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }

    const reqEmail = req.headers["x-user-email"];
    const reqRole = req.headers["x-user-role"];
    if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
      return res.status(403).send({ success: false, message: "Forbidden: Cannot access other freelancer earnings." });
    }

    const freelancerProposals = await proposalCollection
      .find({ freelancerEmail: email })
      .toArray();
    const proposalIds = freelancerProposals.map((p) => String(p._id));
    const taskIds = freelancerProposals.map((p) => String(p.taskId));

    const payments = await paymentCollection
      .find({
        $or: [
          { freelancerEmail: email },
          { proposalId: { $in: proposalIds } },
          { taskId: { $in: taskIds } },
        ],
      })
      .sort({ paymentDate: -1, createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: payments,
    });
  } catch (error) {
    console.error("Error fetching freelancer payments:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

module.exports = {
  confirmSession,
  getClientPayments,
  getFreelancerPayments,
};
