require("dotenv").config();
const mongoose = require("mongoose");
const Booking = require("../src/models/Booking");

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000/api";
const EVENT_ID = process.env.TEST_EVENT_ID;
const CONCURRENT_REQUESTS = parseInt(process.env.TEST_CONCURRENT || "20", 10);
const TOKEN = process.env.TEST_TOKEN;

// Either a single uniform quantity (TEST_SEATS) or a comma-separated list
// cycled across requests (TEST_QUANTITIES=4,3,5,2) for mixed-quantity scenarios.
const QUANTITIES = process.env.TEST_QUANTITIES
  ? process.env.TEST_QUANTITIES.split(",").map((n) => parseInt(n.trim(), 10))
  : [parseInt(process.env.TEST_SEATS || "1", 10)];

if (!EVENT_ID || !TOKEN) {
  console.error(
    "Set TEST_EVENT_ID and TEST_TOKEN environment variables before running.",
  );
  process.exit(1);
}

function quantityForRequest(index) {
  return QUANTITIES[index % QUANTITIES.length];
}

async function bookOnce(quantity) {
  const start = Date.now();

  const response = await fetch(`${BASE_URL}/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ eventId: EVENT_ID, quantity }),
  });

  const elapsed = Date.now() - start;

  return {
    success: response.ok,
    status: response.status,
    ms: elapsed,
    quantity,
  };
}

async function runTest() {
  console.log(
    `Firing ${CONCURRENT_REQUESTS} concurrent booking requests (quantities: ${QUANTITIES.join(",")})...`,
  );

  const startedAt = Date.now();

  const promises = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    promises.push(bookOnce(quantityForRequest(i)));
  }

  const results = await Promise.all(promises);

  const totalTime = Date.now() - startedAt;
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const avgMs = results.reduce((sum, r) => sum + r.ms, 0) / results.length;
  const maxMs = Math.max(...results.map((r) => r.ms));
  const seatsBooked = successful.reduce((sum, r) => sum + r.quantity, 0);

  const statusBreakdown = {};
  for (const r of results) {
    statusBreakdown[r.status] = (statusBreakdown[r.status] || 0) + 1;
  }

  console.log("--- Results ---");
  console.log(`Total requests: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Error count: ${failed.length}`);
  console.log(`Seats booked (successful requests): ${seatsBooked}`);
  console.log(`Status breakdown: ${JSON.stringify(statusBreakdown)}`);
  console.log(`Average response time: ${avgMs.toFixed(1)}ms`);
  console.log(`Maximum response time: ${maxMs}ms`);
  console.log(`Total wall time: ${totalTime}ms`);

  return { successful, failed, seatsBooked };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const beforeRes = await fetch(`${BASE_URL}/events/${EVENT_ID}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const before = (await beforeRes.json()).data.event;

  console.log(
    `Before: totalSeats=${before.totalSeats}, availableSeats=${before.availableSeats}`,
  );

  const { seatsBooked } = await runTest();

  const afterRes = await fetch(`${BASE_URL}/events/${EVENT_ID}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const after = (await afterRes.json()).data.event;

  const expectedAvailable = before.availableSeats - seatsBooked;

  // Ground-truth cross-check: sum actual CONFIRMED Booking documents for
  // this event directly from the database, independent of what the HTTP
  // responses claimed.
  const confirmedBookings = await Booking.find({
    eventId: EVENT_ID,
    status: "CONFIRMED",
  });
  const dbBookedSeats = confirmedBookings.reduce((sum, b) => sum + b.quantity, 0);
  const dbDuplicateCheck = confirmedBookings.length === new Set(confirmedBookings.map((b) => b._id.toString())).size;

  const seatsNeverNegative = after.availableSeats >= 0;
  const seatsNeverExceedTotal = after.availableSeats <= after.totalSeats;
  const consistencyHolds = after.availableSeats === expectedAvailable;
  const dbMatchesEventDoc = after.availableSeats + dbBookedSeats === after.totalSeats;

  console.log("--- Consistency Check ---");
  console.log(`After: availableSeats=${after.availableSeats}`);
  console.log(`Expected availableSeats (from HTTP responses): ${expectedAvailable}`);
  console.log(`Booked seats per DB (sum of CONFIRMED bookings): ${dbBookedSeats}`);
  console.log(`No duplicate booking IDs in DB: ${dbDuplicateCheck}`);
  console.log(`Seats never negative: ${seatsNeverNegative}`);
  console.log(`Seats never exceed total: ${seatsNeverExceedTotal}`);
  console.log(`Consistency holds (HTTP-tracked): ${consistencyHolds}`);
  console.log(
    `Consistency holds (DB ground-truth, availableSeats + bookedSeats == totalSeats): ${dbMatchesEventDoc}`,
  );

  await mongoose.disconnect();

  const allChecksPassed =
    seatsNeverNegative && seatsNeverExceedTotal && consistencyHolds && dbMatchesEventDoc && dbDuplicateCheck;

  if (!allChecksPassed) {
    console.error("CONSISTENCY CHECK FAILED");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Test script crashed:", err);
  process.exitCode = 1;
});
