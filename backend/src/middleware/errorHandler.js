const ApiError = require("../utils/ApiError");

function errorHandler(err, req, res, next) {
  console.error(err);
  let statusCode = err instanceof ApiError ? err.statusCode : 500;
  let message = statusCode === 500 ? "Something went wrong, please try again" : err.message;
  let details = err instanceof ApiError ? err.details : null;

  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed";
    details = Object.values(err.errors).map((e) => e.message);
  }

  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired, please login again";
  }

  if (err.errorLabels && err.errorLabels.includes("TransientTransactionError")) {
    statusCode = 409;
    message = "Conflict updating seats, please retry";
  }

  if (err.name === "MongoServerError" && err.codeName === "ExceededTimeLimit") {
    statusCode = 503;
    message = "Server is busy, please retry shortly";
  }

  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `${field} already exists` : "Duplicate value";
  }

  res.status(statusCode).json({
    success: false,
    message,
    details,
  });
}

module.exports = errorHandler;