const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || "skillswap_super_secret_internal_key_2026";

const verifyInternalAuth = (req, res, next) => {
  const secret = req.headers["x-internal-secret"];
  if (secret && secret === INTERNAL_SECRET) {
    return next();
  }
  return res.status(401).json({
    success: false,
    message: "Unauthorized: Invalid or missing authentication credentials.",
  });
};

const requireAdminAuth = (req, res, next) => {
  const secret = req.headers["x-internal-secret"];
  const userRole = req.headers["x-user-role"];

  if (secret === INTERNAL_SECRET && userRole === "admin") {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Forbidden: Administrator privileges required.",
  });
};

module.exports = {
  verifyInternalAuth,
  requireAdminAuth,
};
