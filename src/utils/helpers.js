const { ObjectId } = require("mongodb");

// Helper to validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return Boolean(id && ObjectId.isValid(id) && String(new ObjectId(id)) === String(id));
};

// Helper to escape regex special characters (prevent ReDoS / regex injection)
const escapeRegex = (string) => {
  if (typeof string !== "string") return "";
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

module.exports = {
  isValidObjectId,
  escapeRegex,
};
