# Event Booking System — Backend

A backend API for browsing events and reserving seats, built specifically to demonstrate that the same seat can never be sold twice — even when many users try to book it at the exact same moment. Built incrementally over Week 4, day by day, with each day's work layered on top of the last.

## Project Overview

Users register, log in, browse upcoming events, and reserve seats. Admins create and manage events. On the surface this is a standard CRUD API, but the actual engineering problem the project solves is concurrency: when N users simultaneously try to book the last few seats of an event, the system must guarantee that at most `availableSeats` bookings succeed — never more, never fewer than necessary, and never in a way that corrupts the database if something fails mid-operation. Retried or duplicated requests (e.g. a user double-clicking "Book" or a flaky network causing a client to resend) must not create duplicate bookings either.

## Technology Stack

| Concern | Choice |
|---|---|
| Backend framework | Node.js + Express |
| Database | MongoDB (Atlas, shared/free tier — a replica set, which is required for transactions) via Mongoose |
| Authentication | JWT (`jsonwebtoken`), passwords hashed with `bcryptjs` |
| Testing | Node's built-in test runner (`node:test` + `node:assert`), `supertest` for HTTP-level tests, `mongodb-memory-server` (as a replica set) for an isolated test database |
| Concurrency approach | MongoDB multi-document transactions (`session.withTransaction()`) for seat reservation + booking creation, and for cancellation + seat restoration; a unique-index-based locking pattern for idempotency |
| Deployment | Railway (backend), MongoDB Atlas (database) |

## Architecture

```
server.js            → loads env, connects DB, starts listening
  src/app.js          → Express app: middleware + routes (imported directly by tests, no DB/listen)
    routes/           → maps URLs to controllers, attaches auth/admin middleware
      controllers/     → business logic (validation, transactions, responses)
        models/         → Mongoose schemas: User, Event, Booking, IdempotencyRecord
    middleware/        → auth (JWT verify), admin-only guard, centralized error handler, 404 handler
    utils/              → ApiError, asyncHandler, response formatter, logger, state-transition rules
```

Request flow for a booking: `routes/booking.routes.js` → `auth.middleware.js` (verifies JWT, attaches `req.user`) → `booking.controller.js` (validates input, checks idempotency key, runs the seat-reservation + booking-creation transaction) → consistent JSON response via `sendSuccess()`/the centralized error handler. Every controller is wrapped in `asyncHandler` so thrown errors always reach the centralized error handler instead of crashing the process.

## Booking Concurrency

**The race condition.** If seat booking were three separate steps — read `availableSeats`, check it in application code, then write the decreased value back — two concurrent requests could both read the same "before" value, both pass the check, and both succeed, deducting more seats than actually existed. See `docs/CONCURRENCY-NOTES.md` for the full worked example.

**How it's prevented.** Seat reservation is a single atomic MongoDB operation — `Event.findOneAndUpdate({ _id, availableSeats: { $gte: quantity } }, { $inc: { availableSeats: -quantity } })` — so the check-and-decrement happens as one indivisible step the database itself serializes across concurrent requests. Whichever request reaches MongoDB first "wins"; every later request re-evaluates the condition against the already-updated value.

**Transactions.** That atomic update only protects the seat count in isolation. To also guarantee that seat deduction and booking creation succeed or fail together (so a crash between the two writes can never leave seats deducted with no booking, or vice versa), both operations run inside a real MongoDB session transaction (`mongoose.startSession()` + `session.withTransaction()`) in `createBooking`, and equivalently for `cancelBooking` (status change + seat restoration). This replaced an earlier compensating-rollback approach (manually "undoing" the seat change in a catch block) that worked for ordinary failures but could permanently lose seats if the server crashed at exactly the wrong moment.

**Overbooking prevention.** A direct consequence of the atomic conditional update: if `availableSeats < quantity`, the update matches no document, `findOneAndUpdate` returns `null`, and the controller responds `409 Conflict` — no seats are touched. This has been verified at concurrency levels from 20 up to 500 simultaneous requests (see Testing below).

**Idempotency.** Clients may send an `Idempotency-Key` header with a booking request. The first request with a given key atomically inserts an `IdempotencyRecord` (the `{userId, idempotencyKey}` unique index acts as a race-safe lock — concurrent duplicates hit a duplicate-key error and know someone else is already processing that exact request), does the real booking, then marks the record `COMPLETED` with the response saved. Any later request with the same key either replays that saved response (if the original request used identical data) or is rejected with `422` (if the data differs) — so retries are always safe, and a key can never be reused for a different booking.

## Testing

- **Unit/integration**: `backend/tests/booking.test.js`, run via `npm test` — 5 automated tests against an in-memory MongoDB replica set (`mongodb-memory-server`, required for transactions), covering normal booking, overbooking rejection, a 20-concurrent-request race, a simulated mid-transaction failure with rollback (via `node:test`'s `mock.method`), and the `availableSeats + bookedSeats = totalSeats` consistency invariant.
- **Concurrency load testing**: `backend/scripts/concurrentBookingTest.js`, a configurable script (event ID, concurrent request count, seats per request, auth token via env vars) that fires real HTTP requests in parallel against a running server and reports successes/failures/status-code breakdown/response times, then verifies the event's final state.
- **Manual/exploratory**: the Postman collection in `docs/` (see Testing & Docs below), and repeated curl-based end-to-end and edge-case sweeps.

Sample results (data correctness held at every scale tested; see Notes.md for the full week-by-week detail):

| Scenario | Result |
|---|---|
| 10 seats, 20 concurrent requests | Exactly 10 succeed, 0 seats left, consistency holds |
| 100 seats, 500 concurrent requests | No overbooking, no negative seats, invariant holds (throughput degrades under this level of single-document contention — see Notes.md's Day 5 performance report for the honest trade-off discussion) |
| 5 seats, 20 concurrent requests sharing one idempotency key | Exactly 1 booking created |
| 1 booking, 20 concurrent cancel requests | Exactly 1 cancellation succeeds, seats restored once |
| Simulated transaction failure mid-booking | No orphan booking, seats correctly restored |
| Full-database integrity audit (35 events, all bookings created across the week) | Zero violations: no negative/orphan/inconsistent records |

## Live Deployment

- API Base URL: https://event-booking-system-production-ca62.up.railway.app/api
- Health Check: https://event-booking-system-production-ca62.up.railway.app/api/health

---

## Day 1 Plan — Setup, Auth & Event Management

1. Project setup — folder structure (config/models/routes/controllers/middleware), env vars, DB connection, CORS, error handling, `/api/health` route.
2. User model — name, email, password, role, createdAt.
3. Auth APIs — register, login, get profile (`/api/auth/me`), JWT-based, passwords hashed, password never returned.
4. Event model — title, description, location, startDate, endDate, totalSeats, availableSeats, price, status, timestamps.
5. Event APIs — create, list, get by id, update, delete (`/api/events`).
6. Role-based access — USER vs ADMIN; only admin can create/update/delete events.
7. Validation & error handling — consistent response format, proper status codes (400/401/403/404/409/500).
8. API testing/docs — Postman collection covering auth + events + error cases.

Note: Concurrency-safe booking logic is NOT part of Day 1 — that comes later this week.

---

## Status (Day 1)

- [x] Task 1: Project Setup
- [x] Task 2: Authentication
- [x] Task 3: Event Model
- [x] Task 4: Event APIs
- [x] Task 5: Authorization
- [x] Task 6: Validation & Errors
- [x] Task 7: Docs & Testing

---

## Day 2 Plan — Booking System, Reservations & Atomic Seat Management

1. Booking/Reservation model — userId, eventId, quantity, totalAmount, status, timestamps.
2. Create booking API — `POST /api/bookings`, authenticated users only.
3. Atomic seat deduction — conditional update (`availableSeats >= quantity`) so concurrent requests can't overbook.
4. Overbooking protection — reject when requested quantity exceeds available seats (`409 Conflict`).
5. Backend price calculation — `totalAmount = event.price * quantity`, never trusts client-provided amount.
6. Booking retrieval — `GET /api/bookings` (own bookings), `GET /api/bookings/:id` (owner-only, `403` otherwise).
7. Booking cancellation — `PATCH /api/bookings/:id/cancel`, restores seats, blocks double-cancellation via conditional update.
8. Rollback handling — if booking creation fails after seat deduction, seats are restored (compensating action).
9. Validation & error handling — all required error cases (missing/invalid quantity, cancelled/ended event, unauthorized access, already-cancelled booking, invalid IDs).

Note: Full concurrent/race-condition stress testing is NOT part of Day 2 — that comes later this week.

## Status (Day 2)

- [x] Task 1: Booking Model
- [x] Task 2: Create Booking API
- [x] Task 3: Atomic Seat Update
- [x] Task 4: Overbooking Protection
- [x] Task 5: Backend Price Calculation
- [x] Task 6: Booking Retrieval APIs
- [x] Task 7: Booking Cancellation
- [x] Task 8: Rollback Handling (compensating action, not full DB transaction — see note below)
- [x] Task 9: Validation & Error Handling
- [x] Task 10: API Testing (Postman)

**Design note:** Task 8 uses a compensating-action pattern (manually reversing the seat update if booking creation fails) rather than a full MongoDB multi-document session transaction. This keeps the same seats atomically correct under concurrent requests; a true session transaction is a possible future improvement once we introduce heavier concurrency testing later this week.

---

## Day 3 Plan — Concurrent Booking, Race Conditions & Concurrency Control

1. Document the booking race condition and how the Day 2 atomic conditional update (`availableSeats >= quantity` + `$inc`) prevents it — see `docs/CONCURRENCY-NOTES.md`.
2. Build a configurable concurrent-booking load test script (`backend/scripts/concurrentBookingTest.js`) — fires N parallel booking requests and reports totals, successes, failures, average response time, plus a before/after seat-consistency check.
3. Run it at all 3 required concurrency levels: 10 seats/20 requests, 50 seats/100 requests, 100 seats/500 requests — plus a mixed-quantity scenario (4+3+5+2 requests against 10 seats).
4. Harden concurrency error handling — unexpected failures now return a generic message + `500` instead of leaking internal error details (JWT/DB errors were already mapped to proper codes from Day 2).
5. Add an automated test suite (`backend/tests/`) covering: normal booking, overbooking rejection, 20-concurrent-request race (max 10 succeed), simulated transaction failure + rollback, and final `availableSeats + bookedSeats = totalSeats` consistency.

Note: Full production-hardening and advanced booking scenarios are Day 4; final validation is Day 5.

## Status (Day 3)

- [x] Task 1: Race Condition Documented (`docs/CONCURRENCY-NOTES.md`)
- [x] Task 2: Concurrency-Safe Seat Reservation (verified, built on Day 2's atomic update)
- [x] Task 3: Transaction-Safe Booking Creation (verified, built on Day 2's rollback)
- [x] Task 4: Overbooking Protection (verified under real concurrent load)
- [x] Task 5: High-Demand / Mixed-Quantity Test
- [x] Task 6: Concurrent Booking Test Script (`backend/scripts/concurrentBookingTest.js`)
- [x] Task 7: Multiple Concurrency Levels (10/20, 50/100, 100/500 — all passed)
- [x] Task 8: Database Consistency Checks
- [x] Task 9: Concurrency Error Handling
- [x] Task 10: Automated Tests (5 tests, `node --test`)

**Design note:** Automated tests use Node's built-in test runner (`node:test`) rather than Jest — Jest's sandboxed test environment was found to reliably break the MongoDB driver's connection handshake in this setup (confirmed as a Jest-environment issue, not a code/driver bug, via isolated reproduction). `node:test` + `node:assert` + `supertest` + `mongodb-memory-server` give the same capability with zero extra dependency and no compatibility issue.

### Running the concurrency load test

```bash
cd backend
TEST_EVENT_ID=<event_id> TEST_TOKEN=<jwt> TEST_CONCURRENT=20 TEST_SEATS=1 node scripts/concurrentBookingTest.js
```

### Running the automated test suite

```bash
cd backend
npm test
```

---

## Day 4 Plan — Reliability, Idempotency & Advanced Booking Scenarios

1. Idempotent booking requests — `Idempotency-Key` header on `POST /api/bookings`; duplicate requests (same key) return the original result instead of creating a second booking, even under real concurrency.
2. `IdempotencyRecord` model — unique index on `(userId, idempotencyKey)` (used as a race-safe lock), TTL index on `expiresAt` for automatic cleanup, stores a request hash to reject key reuse with different data.
3. Concurrent duplicate request testing — verified with 20 truly concurrent requests sharing one key.
4. Safe concurrent cancellation — verified Day 2's atomic conditional cancel under 10 concurrent requests on the same booking.
5. Booking & Event state-transition rules — `src/utils/stateTransitions.js`; explicit allowed transitions (e.g. booking `CONFIRMED → CANCELLED` only, event `UPCOMING → ONGOING → COMPLETED`), enforced regardless of client input.
6. **Real MongoDB transactions** — replaced the Day 2/3 manual compensating-rollback pattern with `mongoose.startSession()` + `session.withTransaction()` in both `createBooking` and `cancelBooking`. No more hand-rolled "undo" code; MongoDB itself guarantees all-or-nothing.
7. Database indexes & constraints on Booking (`userId+createdAt`, `eventId`, `status`) and Event (`status`, `startDate`, `location`); integer validators on `quantity`/`totalSeats`.
8. Query optimization — `deleteEvent` now blocks deletion when the event has active (CONFIRMED) bookings instead of orphaning them.
9. Pagination & filtering — `GET /api/events?page=&limit=&status=&location=&startDate=&endDate=`, `GET /api/bookings?page=&limit=&status=` (bookings always scoped server-side to the authenticated user).
10. Booking activity logging — structured JSON logs (`src/utils/logger.js`) at all required points (request received, seat reservation attempted, booking created/rejected/cancelled, transaction rolled back, idempotency conflict, concurrency conflict). No passwords/tokens ever logged.
11. Final reliability test pass — re-ran the week's concurrency scenarios with Day 4's exact numbers; results recorded below.

## Status (Day 4)

- [x] Task 1: Idempotent Booking Requests
- [x] Task 2: Idempotency Database Record
- [x] Task 3: Concurrent Duplicate Request Testing
- [x] Task 4: Safe Concurrent Cancellation
- [x] Task 5: Booking State Transition Rules
- [x] Task 6: Real MongoDB Transactions (replaces manual rollback)
- [x] Task 7: Database Indexes & Constraints
- [x] Task 8: Optimized Booking & Event Queries
- [x] Task 9: Pagination & Filtering
- [x] Task 10: Booking Activity Logging
- [x] Task 11: Final Reliability Tests

**Design note:** MongoDB transactions require a replica set. Atlas shared-tier clusters already are replica sets, so this needed no infra change in production — but the local test DB (`mongodb-memory-server`) had to switch from `MongoMemoryServer` (standalone) to `MongoMemoryReplSet` (`replSet: { count: 1 }`) in `tests/testDb.js` for the automated tests to keep passing with transaction-based code.

### Final Reliability Test Results (Task 11)

| Test | Config | Result |
|---|---|---|
| Concurrent Booking | 10 seats, 50 concurrent requests, 1 seat/req | 10 successful, 40 failed, `availableSeats=0`, consistency holds |
| Duplicate Idempotency Request | 5 seats, 20 concurrent requests, same key, qty 2 | Exactly 1 Booking created, `availableSeats=3` (deducted once) |
| Concurrent Cancellation | 1 booking (qty 4), 20 concurrent cancel requests | Exactly 1 successful cancel, seats restored +4 (once) |
| Transaction Failure | `Booking.create` mocked to fail mid-transaction | No booking created, seats restored (automated test) |
| Data Consistency | Checked across all events above | `availableSeats >= 0`, `<= totalSeats`, `+ bookedSeats = totalSeats` — all true |

---

## Day 5 Plan — Final Integration, Testing & Production Readiness

1. End-to-end flow verification — the full user journey (register → login → view events → view details → book → view booking → cancel → verify restored) run as one chain.
2. Final concurrency validation — 100 seats, 500 concurrent requests.
3. Mixed concurrent operations — bookings, cancellations, and idempotent retries fired simultaneously against the same event.
4. Final idempotency validation — same-key sequential, same-key concurrent, and same-key-different-data (rejected).
5. Final cancellation validation — full lifecycle plus concurrent cancellation.
6. Security & authorization review.
7. Edge-case sweep across all documented event/booking error cases.
8. Full-database integrity audit.
9. Performance/load report, compared against Day 3/4 numbers.
10. Finalized API documentation (Postman).
11. Production readiness — `.env.example`, restricted CORS, debug-code check, build/start command verification.
12. This README, rewritten as a complete standalone document.
13. Final demonstration prep.

## Status (Day 5)

- [x] Task 1: End-to-End Booking Flow
- [x] Task 2: Final Concurrency Validation (100 seats / 500 requests)
- [x] Task 3: Mixed Concurrent Operations
- [x] Task 4: Final Idempotency Validation
- [x] Task 5: Final Cancellation Validation
- [x] Task 6: Security & Authorization Review
- [x] Task 7: API Error & Edge-Case Testing
- [x] Task 8: Database Integrity Audit
- [x] Task 9: Performance & Load Test Report
- [x] Task 10: API Documentation
- [x] Task 11: Production Readiness
- [x] Task 12: Final README
- [ ] Task 13: Final Project Demonstration

**Honest finding (Task 2/9):** data correctness held at every concurrency level tested, including 500 simultaneous requests against 100 seats (no overbooking, no negative seats, the core invariant always true). However, raw throughput degrades sharply at that extreme scale under real MongoDB transactions — 500 truly-simultaneous requests hammering a single document causes heavy write-conflict contention, and `session.withTransaction()`'s retry loop exhausts itself for most losing requests on a free/shared-tier Atlas cluster (they fail with `500`, not a clean `409`). Day 3's pre-transaction atomic-update approach handled the same 500-request scenario in 14s with 100% of possible bookings succeeding; the transaction-based approach took 134s and completed only 20%. This is a genuine, expected trade-off — transactions buy the crash-safety that was the Day 2/3 reviews' top priority, at a throughput cost under hot-document contention that would need a dedicated (non-shared) cluster, or a queue-based booking design, to fully resolve at flash-sale scale. At moderate concurrency (20-50 requests, closer to realistic traffic) the cost is small (5-14s) and acceptable. Full numbers in Notes.md.

---

## Setup Instructions

**1. Clone the repository**

```bash
git clone https://github.com/web-3-Geeks/event-booking-system.git
cd event-booking-system/backend
```

**2. Install dependencies**

```bash
npm install
```

**3. Configure environment variables**

Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
```

```
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/event-booking
JWT_SECRET=change_this_to_a_long_random_secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000
```

**4. Run the database**

No local database install needed — `MONGO_URI` points at a MongoDB Atlas cluster (a replica set, which transactions require). For local automated tests, `mongodb-memory-server` spins up an ephemeral in-memory replica set automatically — nothing to start manually.

**5. Migrations / setup**

None needed. MongoDB is schema-less at the database level; Mongoose creates collections and the indexes defined in each model (see `src/models/`) automatically the first time the app connects.

**6. Start the server**

```bash
npm run dev    # development, auto-restarts on file changes (nodemon)
npm start       # production
```

Health check: http://localhost:5000/api/health

**7. Run tests**

```bash
npm test
```

Runs the automated suite (`backend/tests/booking.test.js`) against an isolated in-memory MongoDB replica set — no effect on your real database.

To run a concurrency load test against a running server:

```bash
TEST_EVENT_ID=<event_id> TEST_TOKEN=<jwt> TEST_CONCURRENT=20 TEST_SEATS=1 node scripts/concurrentBookingTest.js
```

---

## Project Structure

backend/
  src/
    config/         # DB connection, env config
    controllers/    # Route handlers
    middleware/     # Auth, error handling, validation
    models/         # Mongoose schemas (User, Event, Booking, IdempotencyRecord)
    routes/         # API routes
    utils/          # Helpers (JWT, error classes, logger, state transitions)
    app.js          # Express app config only (no DB connect / listen) — used by server.js and tests
  scripts/
    concurrentBookingTest.js  # Configurable concurrent-load test tool
  tests/
    testDb.js       # In-memory MongoDB replica set helper for tests (transactions need a replica set)
    booking.test.js # Automated tests (node:test)
  server.js

docs/
  CONCURRENCY-NOTES.md
  postman_collection.json
  postman_environment_railway.json
  screenshots/      # API test screenshots

---

## API Endpoints

Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Register new user |
| POST | /api/auth/login | No | Login and get JWT |
| GET | /api/auth/me | Yes | Get current user profile |

Events

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | /api/events?page=&limit=&status=&location=&startDate=&endDate= | Yes | Any | List events (paginated, filterable) |
| GET | /api/events/:id | Yes | Any | Get event by ID |
| POST | /api/events | Yes | ADMIN | Create event |
| PATCH | /api/events/:id | Yes | ADMIN | Update event (status changes validated against allowed transitions) |
| DELETE | /api/events/:id | Yes | ADMIN | Delete event (blocked if it has active bookings) |

Bookings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/bookings | Yes | Create a booking (transaction-safe seat deduction; optional `Idempotency-Key` header for safe retries) |
| GET | /api/bookings?page=&limit=&status= | Yes | List current user's own bookings (paginated, filterable) |
| GET | /api/bookings/:id | Yes | Get own booking by ID (403 if not owner) |
| PATCH | /api/bookings/:id/cancel | Yes | Cancel own booking, restores seats (transaction-safe; blocked once the event has started) |

Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Server health check |

---

## Authentication

All protected endpoints require a JWT token in the Authorization header:

Authorization: Bearer <token>

Roles

| Role | Permissions |
|------|-------------|
| USER | View events, view event details |
| ADMIN | Create, update, delete events |

---

## Testing & Docs

Postman collection and environment are available in docs/:

- postman_collection.json
- postman_environment_railway.json

How to use:
1. Import the collection and the environment into Postman
2. Select the Railway environment
3. Run Login to save token automatically
4. Use Collection Runner to run all tests

Collection covers Auth, Events, Bookings, and a dedicated Idempotency folder (fresh key, duplicate same-key request, and key-reused-with-different-data → 422), plus paginated/filtered examples for both Events and Bookings. Every request has a description covering auth requirements and behavior. Includes all 6 required Day 2 test cases (successful booking, insufficient seats, invalid quantity, cancellation, double cancellation, unauthorized booking access), tested against the live Railway deployment.

API test screenshots are in docs/screenshots/.

---

## License

Internal project — Netixol Internship Week 4.