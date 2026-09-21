const { ObjectId } = require("mongodb");
const { getCollections } = require("../config/db");
const { isValidObjectId } = require("../utils/helpers");

// Submit a review for a completed task/proposal
const createReview = async (req, res) => {
  try {
    const { reviewCollection, proposalCollection, userCollection } = getCollections();
    const { proposalId, rating, comment, clientName, clientImage } = req.body;

    if (!proposalId || !isValidObjectId(proposalId)) {
      return res.status(400).json({
        success: false,
        message: "A valid Proposal ID is required.",
      });
    }

    const numericRating = Number(rating);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be a number between 1 and 5.",
      });
    }

    if (!comment || typeof comment !== "string" || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: "A feedback comment is required.",
      });
    }

    const proposal = await proposalCollection.findOne({ _id: new ObjectId(proposalId) });
    if (!proposal) {
      return res.status(404).json({
        success: false,
        message: "Associated proposal was not found.",
      });
    }

    if (proposal.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Reviews can only be submitted for completed tasks.",
      });
    }

    const reqEmail = req.headers["x-user-email"] || req.body.clientEmail;
    const reqRole = req.headers["x-user-role"];
    if (reqRole !== "admin" && reqEmail && proposal.clientEmail !== reqEmail) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Only the client who posted the project can review this deliverable.",
      });
    }

    // Check if review already exists for this proposal
    const existingReview = await reviewCollection.findOne({
      proposalId: proposal._id.toString(),
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this completed task.",
      });
    }

    const reviewDoc = {
      proposalId: proposal._id.toString(),
      taskId: proposal.taskId ? proposal.taskId.toString() : "",
      taskTitle: proposal.taskTitle || "Completed Project",
      freelancerEmail: proposal.freelancerEmail,
      freelancerName: proposal.freelancerName || "Freelancer",
      clientEmail: proposal.clientEmail,
      clientName: clientName || req.body.clientName || "Client",
      clientImage: clientImage || "",
      rating: numericRating,
      comment: comment.trim(),
      createdAt: new Date(),
    };

    await reviewCollection.insertOne(reviewDoc);

    // Mark proposal as reviewed
    await proposalCollection.updateOne(
      { _id: new ObjectId(proposalId) },
      { $set: { isReviewed: true, reviewedAt: new Date() } }
    );

    // Recalculate freelancer average rating & review count
    const allReviews = await reviewCollection
      .find({ freelancerEmail: proposal.freelancerEmail })
      .toArray();

    const totalReviews = allReviews.length;
    const avgRating =
      totalReviews > 0
        ? Number(
            (
              allReviews.reduce((sum, item) => sum + (Number(item.rating) || 0), 0) /
              totalReviews
            ).toFixed(1)
          )
        : 0;

    await userCollection.updateOne(
      { email: proposal.freelancerEmail },
      {
        $set: {
          averageRating: avgRating,
          reviewCount: totalReviews,
          updatedAt: new Date(),
        },
      }
    );

    return res.status(201).json({
      success: true,
      message: "Thank you! Your review and rating have been posted successfully. ⭐",
      review: reviewDoc,
      averageRating: avgRating,
      reviewCount: totalReviews,
    });
  } catch (error) {
    console.error("Error creating review:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Get all reviews for a freelancer with statistics breakdown
const getFreelancerReviews = async (req, res) => {
  try {
    const { reviewCollection } = getCollections();
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Freelancer email is required.",
      });
    }

    const reviews = await reviewCollection
      .find({ freelancerEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    const totalReviews = reviews.length;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sumRating = 0;

    for (const r of reviews) {
      const star = Math.round(Number(r.rating) || 5);
      if (distribution[star] !== undefined) {
        distribution[star] += 1;
      }
      sumRating += Number(r.rating) || 0;
    }

    const averageRating = totalReviews > 0 ? Number((sumRating / totalReviews).toFixed(1)) : 0;

    return res.status(200).json({
      success: true,
      reviews,
      stats: {
        totalReviews,
        averageRating,
        distribution,
      },
    });
  } catch (error) {
    console.error("Error fetching freelancer reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// Check if a proposal has already been reviewed
const getProposalReview = async (req, res) => {
  try {
    const { reviewCollection } = getCollections();
    const { proposalId } = req.params;

    if (!proposalId) {
      return res.status(400).json({
        success: false,
        message: "Proposal ID is required.",
      });
    }

    const review = await reviewCollection.findOne({ proposalId });

    return res.status(200).json({
      success: true,
      isReviewed: !!review,
      review: review || null,
    });
  } catch (error) {
    console.error("Error checking proposal review:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  createReview,
  getFreelancerReviews,
  getProposalReview,
};
