// Global Express Error Handler
const errorHandler = (err, req, res, _next) => {
  console.error("Unhandled API Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
};

module.exports = errorHandler;
