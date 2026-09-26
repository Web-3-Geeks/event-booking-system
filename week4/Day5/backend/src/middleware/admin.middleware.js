
const ApiError = require("../utils/ApiError");

const adminOnly = (req, res, next) => {
    if (req.user.role !== "ADMIN") {
        throw new ApiError(403, "Admin access required");
    }

    next();
};

module.exports = adminOnly;