
require("dotenv").config();
const { test, describe, before, beforeEach, after, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const app = require("../src/app");
const { connect, clearDatabase, closeDatabase } = require("./testDb");
const User = require("../src/models/User");
const Booking = require("../src/models/Booking");

before(async () => {
    await connect();
});

afterEach(async () => {
    await clearDatabase();
});

after(async () => {
    await closeDatabase();
});

async function createAdminAndEvent(totalSeats) {
    const registerRes = await request(app).post("/api/auth/register").send({
        name: "Admin",
        email: "admin@test.com",
        password: "password123"
    });

    const token = registerRes.body.data.token;
    const userId = registerRes.body.data.user._id;

    await User.findByIdAndUpdate(userId, { role: "ADMIN" });

    const eventRes = await request(app)
     .post("/api/events")
     .set("Authorization", `Bearer ${token}`)
     .send({
        title: "Test Event",
        description: "desc",
        location: "loc",
        startDate: "2026-12-01T18:00:00.000Z",
        endDate: "2026-12-01T22:00:00.000Z",
        totalSeats,
        price: 100
     });

     return{ token, eventId: eventRes.body.data.event._id };
}

describe("Booking flow", () => {
  test("Test 1 — normal booking reduces available seats", async () => {
    const { token, eventId } = await createAdminAndEvent(10);

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ eventId, quantity: 2 });

    assert.strictEqual(res.status, 201);

    const eventRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set("Authorization", `Bearer ${token}`);

    assert.strictEqual(eventRes.body.data.event.availableSeats, 8);
  });

  test("Test 2 — overbooking is rejected", async () => {
    const { token, eventId } = await createAdminAndEvent(2);

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ eventId, quantity: 5 });

    assert.strictEqual(res.status, 409);
  });
});

test("Test 3 — concurrent booking allows only 10 successes for 10 seats", async () => {
  const { token, eventId } = await createAdminAndEvent(10);

  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(
      request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${token}`)
        .send({ eventId, quantity: 1 })
    );
  }

  const results = await Promise.all(promises);

  const successCount = results.filter((r) => r.status === 201).length;
  assert.strictEqual(successCount, 10);

  const eventRes = await request(app)
    .get(`/api/events/${eventId}`)
    .set("Authorization", `Bearer ${token}`);

  assert.strictEqual(eventRes.body.data.event.availableSeats, 0);
});

test("Test 4 — transaction failure rolls back seat deduction", async () => {
  const { token, eventId } = await createAdminAndEvent(10);

  const createMock = mock.method(Booking, "create", () => {
    throw new Error("Simulated DB failure");
  });

  const res = await request(app)
    .post("/api/bookings")
    .set("Authorization", `Bearer ${token}`)
    .send({ eventId, quantity: 3 });

  createMock.mock.restore();

  assert.strictEqual(res.status, 500);

  const bookingCount = await Booking.countDocuments({ eventId });
  assert.strictEqual(bookingCount, 0);

  const eventRes = await request(app)
    .get(`/api/events/${eventId}`)
    .set("Authorization", `Bearer ${token}`);

  assert.strictEqual(eventRes.body.data.event.availableSeats, 10);
});

test("Test 5 — available seats + booked seats equals total seats after concurrent load", async () => {
  const { token, eventId } = await createAdminAndEvent(10);

  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(
      request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${token}`)
        .send({ eventId, quantity: 1 })
    );
  }
  await Promise.all(promises);

  const bookings = await Booking.find({ eventId, status: "CONFIRMED" });
  const bookedSeats = bookings.reduce((sum, b) => sum + b.quantity, 0);

  const eventRes = await request(app)
    .get(`/api/events/${eventId}`)
    .set("Authorization", `Bearer ${token}`);

  const { availableSeats, totalSeats } = eventRes.body.data.event;

  assert.strictEqual(availableSeats + bookedSeats, totalSeats);
});

