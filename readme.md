# BackToOwner — Admin Dashboard Backend

Node.js + Express + SQLite (better-sqlite3) REST API powering the `AdminDashBoard` React app.

## Stack
- Express 4
- **`node:sqlite`** — Node's built-in SQLite driver (file-based DB, zero native dependencies to compile/install)
- JWT auth (`jsonwebtoken`) + `bcryptjs` password hashing
- `multer` for report image uploads

> Requires **Node.js 22.5+**. `node:sqlite` ships unflagged (no `--experimental-sqlite` needed) from Node 23.4+ / 24.x, which is what this was built and tested against.

## Setup
```bash
cd Backend
npm install
copy .env.example .env      # (or `cp` on macOS/Linux) then edit values
npm run seed                 # creates the default admin + starter categories
npm run dev                  # starts on http://localhost:5000
```

Default seeded admin login (override in `.env` before seeding):
- email: `admin@backtoowner.com`
- password: `Admin@12345`

The SQLite file is created automatically at `data/admin.sqlite` (path configurable via `DB_PATH`).

## Auth
All routes except `/api/auth/login` and `/api/auth/register` require:
```
Authorization: Bearer <token>
```
Get a token from `POST /api/auth/login`.

## API overview

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/login` | Admin login → `{ token, admin }` |
| POST | `/api/auth/register` | Create another admin account |
| GET | `/api/auth/me` | Current admin profile |
| GET | `/api/reports` | List reports (`search`, `type`, `category`, `status`, `page`, `pageSize`) |
| GET | `/api/reports/:id` | Report detail |
| POST | `/api/reports` | Create a report |
| PATCH | `/api/reports/:id` | Update / change status of a report |
| DELETE | `/api/reports/:id` | Delete a report |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |
| PATCH | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Delete category (blocked if in use) |
| GET | `/api/matches` | List AI-suggested match pairs (`status`) |
| POST | `/api/matches` | Create a candidate match (lostItemId, foundItemId) |
| POST | `/api/matches/:id/approve` | Approve → marks both reports as `matched` |
| POST | `/api/matches/:id/reject` | Reject a match |
| GET | `/api/notifications` | List notifications / broadcasts |
| POST | `/api/notifications/broadcast` | Send a geo-broadcast alert |
| PATCH | `/api/notifications/:id/read` | Mark as read |
| DELETE | `/api/notifications/:id` | Delete a notification |
| GET | `/api/users` | List registered users (`search`, `status`) |
| GET | `/api/users/:id` | User detail |
| PATCH | `/api/users/:id/status` | Suspend / ban / reactivate a user |
| GET | `/api/stats/overview` | Dashboard KPI cards |
| GET | `/api/stats/breakdown` | Counts by category/type/status + 14-day trend |
| POST | `/api/uploads` | Upload a report image (`multipart/form-data`, field `image`) → `{ url }` |

All responses are JSON: `{ success, data }` on success, `{ success: false, message }` on error.

## Project layout
```
src/
  config/env.js         Environment config
  db/                    SQLite connection, schema.sql, seed.js
  middleware/            auth guard, error handler
  modules/<name>/        routes + controller per resource
  utils/                 asyncHandler, JWT helpers, ApiError, id generator
  app.js / server.js
```

## Wiring up the frontend
Point the `AdminDashBoard` app at this API's base URL (e.g. `http://localhost:5000/api`) and replace the mock-data controllers in `src/controllers/*` with real `fetch`/`axios` calls, storing the JWT (e.g. in `localStorage`) and sending it as `Authorization: Bearer <token>`. Not done yet — this repo only exposes the backend.
