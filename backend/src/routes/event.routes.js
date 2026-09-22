
const express = require("express");
const protect = require("../middleware/auth.middleware");
const adminOnly = require("../middleware/admin.middleware");
const {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} = require("../controllers/event.controller");

const router = express.Router();

router.post("/", protect, adminOnly, createEvent);
router.get("/", protect, getEvents);
router.get("/:id", protect, getEventById);
router.patch("/:id", protect, adminOnly, updateEvent);
router.delete("/:id", protect, adminOnly, deleteEvent);

module.exports = router;
