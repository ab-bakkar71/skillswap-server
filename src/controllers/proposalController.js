const { ObjectId } = require("mongodb");
const { getCollections } = require("../config/db");
const { isValidObjectId } = require("../utils/helpers");
const { createNotification } = require("./notificationController");

// Submit Proposal
const createProposal = async (req, res) => {
  try {
    const { proposalCollection } = getCollections();
    const proposal = req.body;

    if (!proposal.taskId || !proposal.freelancerEmail) {
      return res.status(400).send({
        success: false,
        message: "Task ID and Freelancer Email are required.",
      });
    }

    if (proposal.proposedBudget !== undefined) {
      const parsedProposed = Number(proposal.proposedBudget);
      if (isNaN(parsedProposed) || parsedProposed <= 0) {
        return res.status(400).send({
          success: false,
          message: "Proposed budget must be a valid positive number.",
        });
      }
    }

    const userEmail = req.headers["x-user-email"];
    if (userEmail && proposal.freelancerEmail !== userEmail) {
      return res.status(403).send({
        success: false,
        message: "Forbidden: Cannot submit proposal for another user.",
      });
    }

    const alreadySubmitted = await proposalCollection.findOne({
      taskId: proposal.taskId,
      freelancerEmail: proposal.freelancerEmail,
    });

    if (alreadySubmitted) {
      return res.status(400).send({
        success: false,
        message: "You have already submitted a proposal for this task.",
      });
    }

    const finalProposal = {
      ...proposal,
      createdAt: new Date(),
      createAt: new Date(),
      status: "pending",
    };

    const result = await proposalCollection.insertOne(finalProposal);

    if (finalProposal.clientEmail) {
      createNotification({
        recipientEmail: finalProposal.clientEmail,
        senderEmail: finalProposal.freelancerEmail,
        senderName: finalProposal.freelancerName || "A Freelancer",
        title: "New Proposal Received",
        message: `${finalProposal.freelancerName || "A freelancer"} submitted a proposal of $${finalProposal.proposedBudget} for "${finalProposal.taskTitle || "your task"}"`,
        link: `/dashboard/client/proposal`,
        type: "proposal_received",
      }).catch(() => {});
    }

    res.status(201).send({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Error submitting proposal:", error);
    res.status(500).send({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Get proposals for Freelancer dashboard
const getFreelancerProposals = async (req, res) => {
  try {
    const { proposalCollection } = getCollections();
    const email = req.params.email;

    const reqEmail = req.headers["x-user-email"];
    const reqRole = req.headers["x-user-role"];
    if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
      return res.status(403).send({ success: false, message: "Forbidden: Cannot access other freelancer proposals." });
    }

    const query = { freelancerEmail: email };
    const result = await proposalCollection
      .find(query)
      .sort({ createdAt: -1, createAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Error fetching freelancer proposals:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Get proposals for Client dashboard
const getClientProposals = async (req, res) => {
  try {
    const { proposalCollection } = getCollections();
    const email = req.params.email;

    const reqEmail = req.headers["x-user-email"];
    const reqRole = req.headers["x-user-role"];
    if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
      return res.status(403).send({ success: false, message: "Forbidden: Cannot access other client proposals." });
    }

    const query = { clientEmail: email };
    const result = await proposalCollection
      .find(query)
      .sort({ createdAt: -1, createAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Error fetching client proposals:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Get proposals by Task ID
const getProposalsByTaskId = async (req, res) => {
  try {
    const { proposalCollection } = getCollections();
    const taskId = req.params.taskId;
    const query = { taskId: taskId };

    const result = await proposalCollection
      .find(query)
      .sort({ createdAt: -1, createAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Error fetching proposals by taskId:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Get active accepted tasks for Freelancer
const getActiveTasks = async (req, res) => {
  try {
    const { proposalCollection } = getCollections();
    const email = req.params.email;

    const reqEmail = req.headers["x-user-email"];
    const reqRole = req.headers["x-user-role"];
    if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
      return res.status(403).send({ success: false, message: "Forbidden: Cannot access other active tasks." });
    }

    const query = {
      freelancerEmail: email,
      status: { $in: ["accepted", "submitted", "completed"] },
    };
    const result = await proposalCollection
      .find(query)
      .sort({ createdAt: -1, createAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Error fetching active tasks:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Reject Proposal
const rejectProposal = async (req, res) => {
  try {
    const { proposalCollection } = getCollections();
    const id = req.params.id;

    if (!isValidObjectId(id)) {
      return res.status(400).send({ success: false, message: "Invalid Proposal ID format" });
    }

    const filter = { _id: new ObjectId(id) };
    const prop = await proposalCollection.findOne(filter);
    const updateDoc = {
      $set: {
        status: "rejected",
        updatedAt: new Date(),
      },
    };

    const result = await proposalCollection.updateOne(filter, updateDoc);

    if (prop?.freelancerEmail) {
      createNotification({
        recipientEmail: prop.freelancerEmail,
        senderEmail: prop.clientEmail,
        senderName: "Client",
        title: "Proposal Not Selected",
        message: `Your proposal for "${prop.taskTitle || "task"}" was not selected.`,
        link: `/dashboard/freelancer/proposals`,
        type: "proposal_rejected",
      }).catch(() => {});
    }

    res.send(result);
  } catch (error) {
    console.error("Error rejecting proposal:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Submit Work / Deliverable for Client Review
const submitWork = async (req, res) => {
  try {
    const { proposalCollection, taskCollection } = getCollections();
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({ success: false, message: "Invalid Proposal ID format" });
    }

    const { deliverableUrl, submissionNotes } = req.body;

    if (!deliverableUrl || typeof deliverableUrl !== "string" || !deliverableUrl.trim().startsWith("http")) {
      return res.status(400).send({
        success: false,
        message: "A valid deliverable URL starting with http:// or https:// is required.",
      });
    }

    const proposal = await proposalCollection.findOne({ _id: new ObjectId(id) });
    if (!proposal) {
      return res.status(404).send({ success: false, message: "Proposal not found" });
    }

    const reqEmail = req.headers["x-user-email"] || req.body?.freelancerEmail;
    const reqRole = req.headers["x-user-role"];
    if (reqRole !== "admin" && reqEmail && proposal.freelancerEmail !== reqEmail) {
      return res.status(403).send({ success: false, message: "Forbidden: You can only submit work for your own assigned proposals." });
    }

    const now = new Date();
    await proposalCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: "submitted",
          deliverableUrl: deliverableUrl.trim(),
          submissionNotes: submissionNotes ? String(submissionNotes).trim() : "",
          submittedAt: now,
          updatedAt: now,
        },
      }
    );

    if (isValidObjectId(proposal.taskId)) {
      await taskCollection.updateOne(
        { _id: new ObjectId(proposal.taskId) },
        {
          $set: {
            status: "submitted",
            updatedAt: now,
          },
        }
      );
    }

    if (proposal.clientEmail) {
      createNotification({
        recipientEmail: proposal.clientEmail,
        senderEmail: proposal.freelancerEmail,
        senderName: proposal.freelancerName || "Freelancer",
        title: "Work Deliverable Submitted",
        message: `${proposal.freelancerName || "Freelancer"} submitted the work for "${proposal.taskTitle || "your task"}". Please review and approve.`,
        link: `/dashboard/client/my-task/${proposal.taskId}`,
        type: "work_submitted",
      }).catch(() => {});
    }

    res.send({
      success: true,
      message: "Work submitted successfully for client review.",
    });
  } catch (error) {
    console.error("Error submitting work:", error);
    res.status(500).send({ success: false, message: error.message || "Internal Server Error" });
  }
};

// Client Approves Deliverable and Completes Task
const approveWork = async (req, res) => {
  try {
    const { proposalCollection, taskCollection } = getCollections();
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({ success: false, message: "Invalid Proposal ID format" });
    }

    const proposal = await proposalCollection.findOne({ _id: new ObjectId(id) });
    if (!proposal) {
      return res.status(404).send({ success: false, message: "Proposal not found" });
    }

    const reqEmail = req.headers["x-user-email"] || req.body?.clientEmail;
    const reqRole = req.headers["x-user-role"];
    if (reqRole !== "admin" && reqEmail && proposal.clientEmail !== reqEmail) {
      return res.status(403).send({ success: false, message: "Forbidden: Only the client can approve this submission." });
    }

    const now = new Date();
    await proposalCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: "completed",
          completedAt: now,
          updatedAt: now,
        },
      }
    );

    if (isValidObjectId(proposal.taskId)) {
      await taskCollection.updateOne(
        { _id: new ObjectId(proposal.taskId) },
        {
          $set: {
            status: "completed",
            updatedAt: now,
          },
        }
      );
    }

    if (proposal.freelancerEmail) {
      createNotification({
        recipientEmail: proposal.freelancerEmail,
        senderEmail: proposal.clientEmail,
        senderName: "Client",
        title: "Work Approved & Completed! 🎉",
        message: `Client approved your work for "${proposal.taskTitle || "task"}". Earnings have been added to your balance!`,
        link: `/dashboard/freelancer/earn`,
        type: "work_approved",
      }).catch(() => {});
    }

    res.send({
      success: true,
      message: "Deliverable approved! Task marked as completed.",
    });
  } catch (error) {
    console.error("Error approving deliverable:", error);
    res.status(500).send({ success: false, message: error.message || "Internal Server Error" });
  }
};

// Client Requests Revision with Feedback
const requestRevision = async (req, res) => {
  try {
    const { proposalCollection, taskCollection } = getCollections();
    const { id } = req.params;
    const { revisionNotes } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).send({ success: false, message: "Invalid Proposal ID format" });
    }

    if (!revisionNotes || !String(revisionNotes).trim()) {
      return res.status(400).send({ success: false, message: "Please provide revision notes explaining what needs improvement." });
    }

    const proposal = await proposalCollection.findOne({ _id: new ObjectId(id) });
    if (!proposal) {
      return res.status(404).send({ success: false, message: "Proposal not found" });
    }

    const reqEmail = req.headers["x-user-email"] || req.body?.clientEmail;
    const reqRole = req.headers["x-user-role"];
    if (reqRole !== "admin" && reqEmail && proposal.clientEmail !== reqEmail) {
      return res.status(403).send({ success: false, message: "Forbidden: Only the client can request revisions." });
    }

    const now = new Date();
    await proposalCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: "accepted",
          revisionNotes: String(revisionNotes).trim(),
          updatedAt: now,
        },
        $inc: {
          revisionCount: 1,
        },
      }
    );

    if (isValidObjectId(proposal.taskId)) {
      await taskCollection.updateOne(
        { _id: new ObjectId(proposal.taskId) },
        {
          $set: {
            status: "in-progress",
            updatedAt: now,
          },
        }
      );
    }

    if (proposal.freelancerEmail) {
      createNotification({
        recipientEmail: proposal.freelancerEmail,
        senderEmail: proposal.clientEmail,
        senderName: "Client",
        title: "Revision Requested 🔄",
        message: `Client requested changes on "${proposal.taskTitle || "task"}": "${String(revisionNotes).slice(0, 100)}"`,
        link: `/dashboard/freelancer/active-project`,
        type: "revision_requested",
      }).catch(() => {});
    }

    res.send({
      success: true,
      message: "Revision requested successfully.",
    });
  } catch (error) {
    console.error("Error requesting revision:", error);
    res.status(500).send({ success: false, message: error.message || "Internal Server Error" });
  }
};

// Legacy Direct Complete Task
const completeProposal = async (req, res) => {
  try {
    const { proposalCollection, taskCollection } = getCollections();
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({ success: false, message: "Invalid Proposal ID format" });
    }

    const { deliverableUrl } = req.body;

    if (!deliverableUrl || typeof deliverableUrl !== "string" || !deliverableUrl.trim().startsWith("http")) {
      return res.status(400).send({
        success: false,
        message: "A valid deliverable URL starting with http:// or https:// is required.",
      });
    }

    const proposal = await proposalCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!proposal) {
      return res.status(404).send({
        success: false,
        message: "Proposal not found",
      });
    }

    const reqEmail = req.headers["x-user-email"] || req.body?.freelancerEmail;
    const reqRole = req.headers["x-user-role"];
    if (reqRole !== "admin" && reqEmail && proposal.freelancerEmail !== reqEmail) {
      return res.status(403).send({ success: false, message: "Forbidden: You can only complete your own assigned proposals." });
    }

    // Proposal update
    await proposalCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: "completed",
          deliverableUrl: deliverableUrl.trim(),
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    // Related Task update
    if (isValidObjectId(proposal.taskId)) {
      await taskCollection.updateOne(
        { _id: new ObjectId(proposal.taskId) },
        {
          $set: {
            status: "completed",
            updatedAt: new Date(),
          },
        }
      );
    }

    res.send({
      success: true,
      message: "Task marked as completed successfully.",
    });
  } catch (error) {
    console.error("Error completing proposal:", error);
    res.status(500).send({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

module.exports = {
  createProposal,
  getFreelancerProposals,
  getClientProposals,
  getProposalsByTaskId,
  getActiveTasks,
  rejectProposal,
  submitWork,
  approveWork,
  requestRevision,
  completeProposal,
};
