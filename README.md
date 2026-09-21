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

## Status

- [ ] Task 1: Project Setup
- [ ] Task 2: Authentication
- [ ] Task 3: Event Model
- [ ] Task 4: Event APIs
- [ ] Task 5: Authorization
- [ ] Task 6: Validation & Errors
- [ ] Task 7: Docs & Testing

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
    models/         # Mongoose schemas
    routes/         # API routes
    utils/          # Helpers (JWT, error classes)
  docs/
    postman/        # Postman collection + environments
    screenshots/    # API test screenshots
  server.js

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
| GET | /api/events | Yes | Any | List all events |
| GET | /api/events/:id | Yes | Any | Get event by ID |
| POST | /api/events | Yes | ADMIN | Create event |
| PATCH | /api/events/:id | Yes | ADMIN | Update event |
| DELETE | /api/events/:id | Yes | ADMIN | Delete event |

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

Postman collection and environments are available in docs/postman/:

- postman_collection.json
- postman_environment_local.json
- postman_environment_railway.json

How to use:
1. Import the collection and both environments into Postman
2. Select environment (Local or Railway)
3. Run Login to save token automatically
4. Use Collection Runner to run all tests

API test screenshots are in docs/screenshots/.

---

## License

Internal project — Netixol Internship Week 4.