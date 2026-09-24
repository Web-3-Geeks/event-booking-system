const mongoose = require("mongoose");

const idempotencyRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
    },
    requestHash: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["PROCESSING", "COMPLETED"],
      default: "PROCESSING",
    },
    responseData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

idempotencyRecordSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true },
);
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("IdempotencyRecord", idempotencyRecordSchema);
