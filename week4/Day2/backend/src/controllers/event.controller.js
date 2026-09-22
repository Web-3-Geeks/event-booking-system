const Event = require("../models/Event");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { sendSuccess } = require("../utils/apiResponse");

const createEvent = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    location,
    startDate,
    endDate,
    totalSeats,
    price,
  } = req.body;

  // Required fields validation
  if (
    !title ||
    !description ||
    !location ||
    !startDate ||
    !endDate ||
    totalSeats === undefined ||
    price === undefined
  ) {
    throw new ApiError(400, "All event fields are required");
  }

  // Number validation
  if (totalSeats <= 0) {
    throw new ApiError(400, "totalSeats must be greater than 0");
  }

  if (price < 0) {
    throw new ApiError(400, "price cannot be negative");
  }

  // Date validation
  if (new Date(endDate) <= new Date(startDate)) {
    throw new ApiError(400, "End date must be after start date");
  }

  const event = await Event.create({
    title,
    description,
    location,
    startDate,
    endDate,
    totalSeats,
    price,
    availableSeats: totalSeats,
    createdBy: req.user._id,
  });

  sendSuccess(res, 201, "Event created successfully", { event });
});

const getEvents = asyncHandler(async (req, res) => {
  const events = await Event.find();

  sendSuccess(res, 200, "Events fetched successfully", { events });
});

const getEventById = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new ApiError(404, "Event not found");
  }

  sendSuccess(res, 200, "Event fetched successfully", { event });
});

const updateEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new ApiError(404, "Event not found");
  }

  const {
    title,
    description,
    location,
    startDate,
    endDate,
    totalSeats,
    price,
    status,
  } = req.body;

  const newStartDate = startDate ? new Date(startDate) : event.startDate;
  const newEndDate = endDate ? new Date(endDate) : event.endDate;

  if (totalSeats !== undefined && totalSeats <= 0) {
    throw new ApiError(400, "totalSeats must be greater than 0");
  }

  if (price !== undefined && price < 0) {
    throw new ApiError(400, "price cannot be negative");
  }

  if (newEndDate <= newStartDate) {
    throw new ApiError(400, "End date must be after start date");
  }

  if (totalSeats !== undefined) {
    const bookedSeats = event.totalSeats - event.availableSeats;
    const newAvailableSeats = totalSeats - bookedSeats;

    if (newAvailableSeats < 0) {
      throw new ApiError(
        400,
        "totalSeats cannot be less than already booked seats",
      );
    }

    event.totalSeats = totalSeats;
    event.availableSeats = newAvailableSeats;
  }

  if (title !== undefined) event.title = title;
  if (description !== undefined) event.description = description;
  if (location !== undefined) event.location = location;
  if (startDate !== undefined) event.startDate = startDate;
  if (endDate !== undefined) event.endDate = endDate;
  if (price !== undefined) event.price = price;
  if (status !== undefined) event.status = status;

  await event.save();

  sendSuccess(res, 200, "Event updated successfully", { event });
});

const deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new ApiError(404, "Event not found");
  }

  await event.deleteOne();

  sendSuccess(res, 200, "Event deleted successfully");
});

module.exports = {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
};
