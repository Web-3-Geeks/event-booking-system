# Concurrency Notes — Booking Race Condition

## The Race Condition

If seat booking were implemented as four separate steps —
read availableSeats, check it in application code, create the
booking, then write the decreased value back — two concurrent
requests could both read the same "before" value.

Example: Event has 5 available seats. User A requests 4 seats
and User B requests 4 seats at nearly the same time.

1. User A reads availableSeats = 5
2. User B reads availableSeats = 5 (before A has written anything back)
3. User A checks: 5 >= 4 -> passes
4. User B checks: 5 >= 4 -> passes
5. Both create a booking and both write availableSeats = 5 - 4 = 1

Result: 8 seats were booked out of only 5 available — an
overbooking bug, and the final availableSeats value (1) doesn't
even reflect reality.

## Why Application-Level Checking Is Insufficient

An `if (availableSeats >= quantity)` check in application code
only sees the data that was read into that request's memory at
that moment. It has no way of knowing that another concurrent
request is making the same decision at the same time based on
the same stale value. Two requests running in parallel don't
"see" each other's in-progress work.

## Where Concurrent Requests Interfere

The interference happens in the gap between reading a value and
writing the updated value back. The longer that gap (more steps,
more processing time in between), the larger the window during
which a second request can read the same outdated value and make
an incorrect decision.

## How the Database Prevents It

Instead of read-check-write as three separate steps, the booking
flow uses a single atomic conditional update:

    Event.findOneAndUpdate(
      { _id: eventId, availableSeats: { $gte: quantity } },
      { $inc: { availableSeats: -quantity } }
    )

MongoDB executes the condition check and the update as one
indivisible operation on a single document. Concurrent requests
targeting the same document are serialized internally by the
database: the first request's check-and-update completes fully
before the second request's check is evaluated, so the second
request always sees the already-updated value. If the condition
no longer holds, the update simply doesn't apply and the query
returns null, which the API treats as "not enough seats".

Whichever request's update operation reaches MongoDB first "wins" —
its seat deduction succeeds. The other request's condition then
evaluates against the already-updated (lower) seat count and fails
if there aren't enough seats left, rather than both succeeding
based on stale data.

