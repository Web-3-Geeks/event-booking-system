# Event Booking System — Backend

Week 4 project: backend that handles event browsing & seat booking, with safe concurrency handling (later days). Built incrementally, day by day.

Stack: Node.js + Express + MongoDB (Mongoose) + JWT + bcryptjs.

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

## Status
- [ ] Task 1: Project Setup
- [ ] Task 2: Authentication
- [ ] Task 3: Event Model
- [ ] Task 4: Event APIs
- [ ] Task 5: Authorization
- [ ] Task 6: Validation & Errors
- [ ] Task 7: Docs & Testing
