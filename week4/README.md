# Week 4 — Daily Snapshots

Each `DayN/` folder is a full, standalone copy of the project exactly as it stood at the end of that day (own `backend/`, `docs/`, etc.). Cumulative — DayN includes all work through Day N, not just that day's diff.

- **Day1/** — Project setup, JWT auth (register/login/me), Event model, Event CRUD APIs, role-based authorization (USER/ADMIN), centralized validation & error handling, Postman docs.
- **Day2/** — Everything from Day 1, plus: Booking/Reservation model, create-booking API with atomic seat deduction (race-safe conditional update), overbooking protection, backend-calculated pricing, booking retrieval APIs (owner-only), booking cancellation with safe seat restoration and double-cancellation protection, rollback handling, full validation/error-case coverage.
- **Day3/** — Everything from Day 2, plus: written analysis of the booking race condition and how the atomic update prevents it (`docs/CONCURRENCY-NOTES.md`), a configurable concurrent-booking load test script (`backend/scripts/concurrentBookingTest.js`) verified at 20/100/500 simultaneous requests and a mixed-quantity scenario with zero overbooking, and hardened error handling so unexpected failures return a generic message instead of leaking internal error details.

`archive/` is a placeholder for deprecated/old files, if any accumulate later.

The live, current codebase always lives at the repo root — that's what's deployed and actively developed. These folders exist for day-by-day evaluation only.
