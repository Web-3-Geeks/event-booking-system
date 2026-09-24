# Event Booking System — Backend

Week 4 project: backend that handles event browsing & seat booking, with safe concurrency handling (later days). Built incrementally, day by day.

Stack: Node.js + Express + MongoDB (Mongoose) + JWT + bcryptjs.

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

## Local Setup

git clone https://github.com/web-3-Geeks/event-booking-system.git
cd event-booking-system/backend
npm install

Create .env in the backend/ folder:

PORT=5000
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d

Run the server:

npm run dev

Health check: http://localhost:5000/api/health

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

Collection covers Auth, Events, and Bookings (including all 6 required Day 2 test cases: successful booking, insufficient seats, invalid quantity, cancellation, double cancellation, unauthorized booking access), tested against the live Railway deployment.

API test screenshots are in docs/screenshots/.

---

## License

Internal project — Netixol Internship Week 4.