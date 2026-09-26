const Event = require("../models/Event");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { sendSuccess } = require("../utils/apiResponse");
const { canTransitionEvent } = require("../utils/stateTransitions");
const Booking = require("../models/Booking");

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
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const filter = {};

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.location) {
    filter.location = req.query.location;
  }

  if (req.query.startDate || req.query.endDate) {
    filter.startDate = {};
    if (req.query.startDate) filter.startDate.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.startDate.$lte = new Date(req.query.endDate);
  }

  const [events, total] = await Promise.all([
    Event.find(filter).sort({ startDate: 1 }).skip(skip).limit(limit),
    Event.countDocuments(filter),
  ]);

  sendSuccess(res, 200, "Events fetched successfully", {
    events,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
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

  if (status !== undefined && !canTransitionEvent(event.status, status)) {
    throw new ApiError(
      400,
      `Cannot change event status from ${event.status} to ${status}`,
    );
  }

  const setFields = {};
  if (title !== undefined) setFields.title = title;
  if (description !== undefined) setFields.description = description;
  if (location !== undefined) setFields.location = location;
  if (startDate !== undefined) setFields.startDate = startDate;
  if (endDate !== undefined) setFields.endDate = endDate;
  if (price !== undefined) setFields.price = price;
  if (status !== undefined) setFields.status = status;

  let updatedEvent;

  if (totalSeats !== undefined) {
    const delta = totalSeats - event.totalSeats;

    updatedEvent = await Event.findOneAndUpdate(
      { _id: event._id, availableSeats: { $gte: -delta } },
      { $inc: { totalSeats: delta, availableSeats: delta }, $set: setFields },
      { new: true, runValidators: true },
    );

    if (!updatedEvent) {
      throw new ApiError(
        400,
        "totalSeats cannot be less than already booked seats",
      );
    }
  } else if (Object.keys(setFields).length > 0) {
    updatedEvent = await Event.findByIdAndUpdate(
      event._id,
      { $set: setFields },
      { new: true, runValidators: true },
    );
  } else {
    updatedEvent = event;
  }

  sendSuccess(res, 200, "Event updated successfully", { event: updatedEvent });
});

const deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new ApiError(404, "Event not found");
  }

  const hasBookings = await Booking.exists({
    eventId: event._id,
    status: "CONFIRMED",
  });

  if (hasBookings) {
    throw new ApiError(
      409,
      "Cannot delete an event with active bookings. Cancel the event instead."
    );
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
