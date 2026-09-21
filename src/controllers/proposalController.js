const { ObjectId } = require("mongodb");
const { getCollections } = require("../config/db");
const { isValidObjectId } = require("../utils/helpers");

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
      status: "accepted",
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
    const updateDoc = {
      $set: {
        status: "rejected",
        updatedAt: new Date(),
      },
    };

    const result = await proposalCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    console.error("Error rejecting proposal:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Complete Task / Submit Deliverable
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
  completeProposal,
};
