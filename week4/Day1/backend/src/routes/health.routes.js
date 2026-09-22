
const express = require("express");
const { sendSuccess } = require("../utils/apiResponse");

const router = express.Router();

router.get("/", (req, res) => {
    sendSuccess(res, 200, "Server is healthy");
});

module.exports = router;