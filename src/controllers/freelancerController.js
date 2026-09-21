const { ObjectId } = require("mongodb");
const { getCollections } = require("../config/db");
const { isValidObjectId, escapeRegex } = require("../utils/helpers");

// Get freelancers with search, skill, sort, pagination
const getFreelancers = async (req, res) => {
  try {
    const { userCollection } = getCollections();
    const { search, skill, sort, page, limit } = req.query;
    const query = { role: "freelancer" };

    if (skill && typeof skill === "string" && skill !== "All") {
      const cleanSkill = escapeRegex(skill.trim());
      query.skills = { $regex: new RegExp(cleanSkill, "i") };
    }

    if (search && typeof search === "string" && search.trim()) {
      const cleanSearch = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: cleanSearch, $options: "i" } },
        { bio: { $regex: cleanSearch, $options: "i" } },
        { skills: { $regex: cleanSearch, $options: "i" } },
      ];
    }

    let sortOption = { createdAt: -1, createAt: -1 };
    if (sort === "rate-desc") {
      sortOption = { hourlyRate: -1 };
    } else if (sort === "rate-asc") {
      sortOption = { hourlyRate: 1 };
    }

    let cursor = userCollection.find(query, { projection: { password: 0 } }).sort(sortOption);

    if (page && limit) {
      const skip = (Number(page) - 1) * Number(limit);
      cursor = cursor.skip(skip).limit(Number(limit));
    }

    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching freelancers:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Get freelancer by ID
const getFreelancerById = async (req, res) => {
  try {
    const { userCollection } = getCollections();
    const id = req.params.id;

    if (!isValidObjectId(id)) {
      return res.status(400).send({ success: false, message: "Invalid Freelancer ID format" });
    }

    const query = { _id: new ObjectId(id) };
    const result = await userCollection.findOne(query, {
      projection: { password: 0 },
    });

    if (!result) {
      return res.status(404).send({ success: false, message: "Freelancer not found" });
    }

    res.send(result);
  } catch (error) {
    console.error("Error fetching freelancer by id:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

// Edit freelancer profile
const updateFreelancer = async (req, res) => {
  try {
    const { userCollection } = getCollections();
    const email = req.params.email;
    const updateData = req.body;

    const reqEmail = req.headers["x-user-email"];
    const reqRole = req.headers["x-user-role"];
    if (reqRole !== "admin" && reqEmail && reqEmail !== email) {
      return res.status(403).send({ success: false, message: "Forbidden: Cannot update other freelancer profiles." });
    }

    const query = { email: email };
    const updateDoc = {
      $set: {
        name: updateData.name,
        image: updateData.image,
        skills: updateData.skills,
        bio: updateData.bio,
        hourlyRate: updateData.hourlyRate,
        updatedAt: new Date(),
      },
    };

    const result = await userCollection.updateOne(query, updateDoc);
    res.send(result);
  } catch (error) {
    console.error("Error updating freelancer:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
};

module.exports = {
  getFreelancers,
  getFreelancerById,
  updateFreelancer,
};
