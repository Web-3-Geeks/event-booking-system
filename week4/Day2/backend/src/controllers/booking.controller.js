const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Event = require("../models/Event");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { sendSuccess } = require("../utils/apiResponse");

const createBooking = asyncHandler(async (req, res) => {
  const { eventId, quantity } = req.body;

  if (!eventId || quantity === undefined) {
    throw new ApiError(400, "eventId and quantity are required");
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ApiError(400, "quantity must be a positive integer");
  }

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new ApiError(400, "Invalid event ID");
  }

  const event = await Event.findById(eventId);

  if (!event) {
    throw new ApiError(404, "Event not found");
  }

  if (event.status === "CANCELLED") {
    throw new ApiError(400, "This event is cancelled");
  }

  if (new Date(event.endDate) <= new Date()) {
    throw new ApiError(400, "This event has already ended");
  }

  const updateEvent = await Event.findOneAndUpdate(
    {
      _id: eventId,
      availableSeats: { $gte: quantity },
    },
    {
      $inc: { availableSeats: -quantity },
    },
    {
      new: true,
    },
  );

  if (!updateEvent) {
    throw new ApiError(409, "Not enough seats available");
  }

  const totalAmount = updateEvent.price * quantity;

  let booking;

  try {
    booking = await Booking.create({
      userId: req.user._id,
      eventId,
      quantity,
      totalAmount,
      status: "CONFIRMED",
    });
  } catch (err) {
    await Event.findByIdAndUpdate(eventId, {
      $inc: { availableSeats: quantity },
    });
    throw err;
  }
  sendSuccess(res, 201, "Booking created successfully", { booking });
});

const getBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ userId: req.user._id }).populate(
    "eventId",
    "title price status startDate",
  );
  sendSuccess(res, 200, "Bookings fetched successfully", { bookings });
});

const getBookingById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, "Invalid booking ID");
  }

  const booking = await Booking.findById(req.params.id).populate(
    "eventId",
    "title price status startDate",
  );

  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }

  if (!booking.userId.equals(req.user._id)) {
    throw new ApiError(403, "You are not authorized to view this booking");
  }

  sendSuccess(res, 200, "Booking fetched successfully", { booking });
});

const cancelBooking = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, "Invalid booking ID");
  }

  const booking = await Booking.findById(req.params.id).populate(
    "eventId",
    "title price status startDate",
  );

  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }

  if (!booking.userId.equals(req.user._id)) {
    throw new ApiError(403, "You are not authorized to cancel this booking");
  }

  const cancelledBooking = await Booking.findOneAndUpdate(
    { _id: req.params.id, status: "CONFIRMED" },
    { status: "CANCELLED" },
    { new: true },
  );

  if (!cancelledBooking) {
    throw new ApiError(400, "Booking is already cancelled");
  }

  await Event.findByIdAndUpdate(cancelledBooking.eventId, {
    $inc: {
      availableSeats: cancelledBooking.quantity,
    },
  });

  sendSuccess(res, 200, "Booking cancelled successfully", {
    booking: cancelledBooking,
  });
});

module.exports = { createBooking, getBookings, getBookingById, cancelBooking };
