const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "quantity must be an integer",
      },
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED"],
      default: "CONFIRMED",
    },
  },
  {
    timestamps: true,
  },
);

BookingSchema.index({ userId: 1, createdAt: -1 });
BookingSchema.index({ eventId: 1 });
BookingSchema.index({ status: 1 });

module.exports = mongoose.model("Booking", BookingSchema);
