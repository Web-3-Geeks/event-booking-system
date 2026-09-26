const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Event = require("../models/Event");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { sendSuccess } = require("../utils/apiResponse");
const {
  canTransitionBooking,
  canTransitionEvent,
} = require("../utils/stateTransitions");
const crypto = require("crypto");
const IdempotencyRecord = require("../models/IdempotencyRecord");
const { logInfo, logWarn, logError } = require("../utils/logger");

async function handleDuplicateIdempotencyRequest(
  req,
  res,
  idempotencyKey,
  requestHash,
) {
  let existing = await IdempotencyRecord.findOne({
    userId: req.user._id,
    idempotencyKey,
  });

  if (!existing) {
    throw new ApiError(409, "Duplicate request conflict, please retry");
  }

  if (existing.requestHash !== requestHash) {
    logWarn("Idempotency conflict - key reused with different data", {
      userId: req.user._id,
      idempotencyKey,
    });
    throw new ApiError(
      422,
      "Idempotency key already used for a different request",
    );
  }

  for (let i = 0; i < 20; i++) {
    if (existing.status === "COMPLETED") {
      return sendSuccess(
        res,
        existing.responseData.statusCode,
        existing.responseData.message,
        existing.responseData.data,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
    existing = await IdempotencyRecord.findOne({
      userId: req.user._id,
      idempotencyKey,
    });
  }

  throw new ApiError(409, "Request is still being processed, please retry");
}

const createBooking = asyncHandler(async (req, res) => {
  const { eventId, quantity } = req.body;

  logInfo("Booking request received", {
    userId: req.user._id,
    eventId,
    quantity,
  });

  if (!eventId || quantity === undefined) {
    throw new ApiError(400, "eventId and quantity are required");
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ApiError(400, "quantity must be a positive integer");
  }

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new ApiError(400, "Invalid event ID");
  }

  const idempotencyKey = req.headers["idempotency-key"];
  let idempotencyRecord = null;

  if (idempotencyKey) {
    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ eventId, quantity }))
      .digest("hex");

    try {
      idempotencyRecord = await IdempotencyRecord.create({
        userId: req.user._id,
        idempotencyKey,
        requestHash,
        status: "PROCESSING",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    } catch (err) {
      if (err.code === 11000) {
        logWarn("Concurrency conflict - duplicate idempotency key insert", {
          userId: req.user._id,
          idempotencyKey,
        });
        return handleDuplicateIdempotencyRequest(
          req,
          res,
          idempotencyKey,
          requestHash,
        );
      }
      throw err;
    }
  }

  const session = await mongoose.startSession();
  let booking;

  try {
    await session.withTransaction(async () => {
      logInfo("Seat reservation attempted", { eventId, quantity });

      const updateEvent = await Event.findOneAndUpdate(
        {
          _id: eventId,
          status: { $in: ["UPCOMING", "ONGOING"] },
          endDate: { $gt: new Date() },
          availableSeats: { $gte: quantity },
        },
        {
          $inc: { availableSeats: -quantity },
        },
        {
          new: true,
          session,
        },
      );

      if (!updateEvent) {
        const current = await Event.findById(eventId).session(session);

        if (!current) {
          throw new ApiError(404, "Event not found");
        }

        if (current.status === "CANCELLED") {
          throw new ApiError(400, "This event is cancelled");
        }

        if (new Date(current.endDate) <= new Date()) {
          throw new ApiError(400, "This event has already ended");
        }

        logWarn("Booking rejected - not enough seats", { eventId, quantity });
        throw new ApiError(409, "Not enough seats available");
      }

      const totalAmount = updateEvent.price * quantity;

      const createdDocs = await Booking.create(
        [
          {
            userId: req.user._id,
            eventId,
            quantity,
            totalAmount,
            status: "CONFIRMED",
          },
        ],
        { session },
      );

      booking = createdDocs[0];

      logInfo("Booking created", { bookingId: booking._id, eventId, quantity });
    });
  } catch (err) {
    logWarn("Transaction rolled back", { eventId, quantity, error: err.message });
    if (idempotencyRecord) {
      await IdempotencyRecord.deleteOne({ _id: idempotencyRecord._id });
    }
    throw err;
  } finally {
    await session.endSession();
  }

  if (idempotencyRecord) {
    await IdempotencyRecord.findByIdAndUpdate(idempotencyRecord._id, {
      status: "COMPLETED",
      responseData: {
        statusCode: 201,
        message: "Booking created successfully",
        data: { booking },
      },
    });
  }

  sendSuccess(res, 201, "Booking created successfully", { booking });
});

const getBookings = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const filter = { userId: req.user._id };

  if (req.query.status) {
    filter.status = req.query.status;
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate("eventId", "title price status startDate")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(filter),
  ]);

  sendSuccess(res, 200, "Bookings fetched successfully", {
    bookings,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
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

  if (!booking.eventId) {
    throw new ApiError(409, "This event no longer exists");
  }

  if (new Date(booking.eventId.startDate) <= new Date()) {
    throw new ApiError(
      400,
      "Cannot cancel a booking after the event has started",
    );
  }

  if (booking.status === "CANCELLED") {
    throw new ApiError(409, "Booking is already cancelled");
  }

  if (!canTransitionBooking(booking.status, "CANCELLED")) {
    throw new ApiError(
      400,
      `Cannot cancel a booking with status ${booking.status}`,
    );
  }

  const session = await mongoose.startSession();
  let cancelledBooking;

  try {
    await session.withTransaction(async () => {
      cancelledBooking = await Booking.findOneAndUpdate(
        { _id: req.params.id, status: "CONFIRMED" },
        { status: "CANCELLED" },
        { new: true, session },
      );

      if (!cancelledBooking) {
        throw new ApiError(409, "Booking is already cancelled");
      }

      await Event.findByIdAndUpdate(
        cancelledBooking.eventId,
        { $inc: { availableSeats: cancelledBooking.quantity } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  logInfo("Booking cancelled", {
    bookingId: cancelledBooking._id,
    eventId: cancelledBooking.eventId,
    quantity: cancelledBooking.quantity,
  });

  sendSuccess(res, 200, "Booking cancelled successfully", {
    booking: cancelledBooking,
  });
});

module.exports = { createBooking, getBookings, getBookingById, cancelBooking };
