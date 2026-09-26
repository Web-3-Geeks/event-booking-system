# Final Demonstration Script

A step-by-step walkthrough covering everything Day 5 Task 13 asks to show. Each step lists the Postman request to use (from `docs/postman_collection.json`) and an equivalent curl command. Run steps in order — later steps reuse IDs/tokens from earlier ones.

Base URL (live): `https://event-booking-system-production-ca62.up.railway.app/api`
Base URL (local): `http://localhost:5000/api`

Replace `$BASE`, `$ADMIN_TOKEN`, `$USER_TOKEN`, `$EVENT_ID`, `$BOOKING_ID` as you go.

---

## 1. User Registration

Postman: **Auth → Register**

```bash
curl -X POST $BASE/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Demo User","email":"demo-user@example.com","password":"password123"}'
```

Point out: password is hashed, never returned in the response; a JWT is issued immediately.

## 2. User Login

Postman: **Auth → Login**

```bash
curl -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"email":"demo-user@example.com","password":"password123"}'
```

Save the returned `token` as `$USER_TOKEN`.

## 3. Event Creation by Admin

Register a second user, promote it to ADMIN in the database (no public "become admin" endpoint, by design), then:

Postman: **Events → Create Event**

```bash
curl -X POST $BASE/events -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"title":"Demo Concert","description":"Live demonstration event","location":"Lahore","startDate":"2027-01-01T18:00:00.000Z","endDate":"2027-01-01T22:00:00.000Z","totalSeats":10,"price":500}'
```

Point out: `availableSeats` is automatically set equal to `totalSeats`; try the same request with `$USER_TOKEN` first to show the `403 Admin access required` rejection.

Save the returned event `_id` as `$EVENT_ID`.

## 4. Event Listing

Postman: **Events → Get Events (Paginated + Filtered)**

```bash
curl "$BASE/events?page=1&limit=10&status=UPCOMING" -H "Authorization: Bearer $USER_TOKEN"
```

Point out: pagination metadata in the response, and that filtering by `status`/`location`/date range all work.

## 5. Successful Booking

Postman: **Bookings → Create Bookings**

```bash
curl -X POST $BASE/bookings -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" \
  -d "{\"eventId\":\"$EVENT_ID\",\"quantity\":2}"
```

Point out: `totalAmount` is calculated server-side (price × quantity) — the client never sends or controls it. Save the returned booking `_id` as `$BOOKING_ID`.

## 6. Available Seat Reduction

```bash
curl $BASE/events/$EVENT_ID -H "Authorization: Bearer $USER_TOKEN"
```

Point out: `availableSeats` dropped from 10 to 8, exactly matching the booked quantity.

## 7. Booking History

Postman: **Bookings → All Bookings** and **Get Bookings (Paginated + Filtered)**

```bash
curl "$BASE/bookings?page=1&limit=10" -H "Authorization: Bearer $USER_TOKEN"
```

Point out: this list is always scoped to the logged-in user server-side — show that the ADMIN's token returns a different (empty or different) list, proving one user can never see another's bookings.

## 8. Booking Cancellation

Postman: **Bookings → Cancel Booking**

```bash
curl -X PATCH $BASE/bookings/$BOOKING_ID/cancel -H "Authorization: Bearer $USER_TOKEN"
```

Point out: booking `status` becomes `CANCELLED`.

## 9. Seat Restoration

```bash
curl $BASE/events/$EVENT_ID -H "Authorization: Bearer $USER_TOKEN"
```

Point out: `availableSeats` is back to 10. Then re-run step 8 to show cancelling an already-cancelled booking is rejected (`400`) and does **not** add seats a second time.

## 10. Concurrent Booking Test

Create a fresh event with a known seat count (e.g. 10), then run the load-test script:

```bash
cd backend
TEST_EVENT_ID=<new_event_id> TEST_TOKEN=$USER_TOKEN TEST_CONCURRENT=20 TEST_SEATS=1 node scripts/concurrentBookingTest.js
```

Point out live: "Successful: 10" (exactly the seat count), "Failed: 10", `Consistency holds: true`.

## 11. Overbooking Prevention

Postman: **Bookings → OverBookings**

```bash
curl -X POST $BASE/bookings -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" \
  -d "{\"eventId\":\"$EVENT_ID\",\"quantity\":99999}"
```

Point out: `409 Conflict`, `availableSeats` unchanged — this is the same mechanism that made step 10 come out exact.

## 12. Duplicate / Idempotent Request Handling

Postman: **Idempotency → Create Booking with Idempotency Key**, then **Duplicate Idempotency Request (Same Data)**

```bash
curl -X POST $BASE/bookings -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" \
  -H "Idempotency-Key: demo-key-123" -d "{\"eventId\":\"$EVENT_ID\",\"quantity\":1}"

# Run the exact same command again — same booking id comes back, no new booking, no extra seat deduction
```

Then Postman: **Idempotency → Idempotency Key Reused with Different Data** — same key, different quantity, expect `422`.

## 13. Concurrent Cancellation Handling

Book a seat, note the `$BOOKING_ID`, then fire many cancel requests at once:

```bash
for i in $(seq 1 10); do
  curl -s -X PATCH $BASE/bookings/$BOOKING_ID/cancel -H "Authorization: Bearer $USER_TOKEN" &
done
wait
```

Point out: only one of the 10 responses is a success; the event's `availableSeats` went up by exactly the booked quantity, not 10x that.

## 14. Final Database Consistency

```bash
curl $BASE/events/$EVENT_ID -H "Authorization: Bearer $USER_TOKEN"
curl "$BASE/bookings?status=CONFIRMED" -H "Authorization: Bearer $USER_TOKEN"
```

Point out the invariant by hand: `availableSeats + (sum of CONFIRMED booking quantities) == totalSeats`. This has been verified programmatically across the entire database (35+ events, every booking created this week) with zero violations — see Notes.md's Task 8 audit.

---

## Closing points to mention

- All of the above (steps 10-13) were also run as **automated tests** (`npm test`) and a **configurable load-testing script**, not just manually — see the Testing section of README.md.
- The core design decision this week: MongoDB **transactions** guarantee seat-deduction + booking-creation (and cancellation + seat-restoration) succeed or fail together, and an **idempotency-key** mechanism guarantees retried/duplicated client requests never double-book.
- Known trade-off, documented honestly: under extreme contention (500 simultaneous requests on one event), transaction throughput degrades — data stays correct, but slower. See README's Day 5 section / Notes.md for the full discussion.
