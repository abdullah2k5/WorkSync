# WorkSync

A professional task and workforce management system.

## Overview

WorkSync is a role-based task and workforce management application supporting three user roles:

- **Admin** — full system access, employee and department management, reports
- **Manager** — team management, task creation and assignment, leave review
- **Employee** — personal dashboard, task progress updates, leave requests

Currently implemented functionality:

- Authentication with JWT and role-based access control
- Role-based dashboards (Admin, Manager, Employee)
- Employee management (create, update, activate/deactivate, password reset)
- Department management
- Task creation, assignment, editing, and deletion
- Task status and progress tracking (To Do / In Progress / Completed)
- Task labels/tags
- Subtasks/checklists per task
- Kanban board view
- Calendar view
- Task comments and activity history
- Task attachments (upload/download/remove)
- Leave requests with manager review workflow
- Announcements with priority and target audience
- Notifications with unread counts, mark-read, and duplicate prevention
- Per-user notification preferences by category
- Real-time notifications via Server-Sent Events (SSE)
- Reports: summaries, task/leave/employee listings, and charts
- CSV-based employee import with preview/validation
- Profile management (details and avatar)
- Secure password-change flow (current-password verification + short-lived token)

## Technology Stack

Frontend:

- Vue 3
- Quasar Framework v2
- Vite (via `@quasar/app-vite`)
- Pinia, Vue Router, Axios, Chart.js

Backend:

- Node.js
- Express

Database:

- PostgreSQL (`pg` driver)

Desktop:

- Electron

## Architecture

WorkSync is a **local-only desktop-first** application. Everything runs on your
own machine — there is **no cloud hosting** and nothing is exposed publicly.

```
PostgreSQL  localhost:5432
        ↓
Node/Express backend  localhost:3000   (API base URL: http://localhost:3000/api)
        ↓
   ┌─────────────────┐
   │                 │
 Browser      WorkSync.exe (Electron)
```

- The **backend** is a standalone Node/Express process (`backend/server.js`) that
  runs on `localhost:3000` and talks to a local PostgreSQL server (default
  `localhost:5432`, database `worksync`) over TCP. It is **not** bundled inside
  the Electron application and is **not** started as a child process by
  Electron.
- The **desktop app** (`WorkSync.exe`, built with Electron) serves the packaged
  Quasar frontend over a local HTTP server and reaches the backend at
  `http://localhost:3000/api`. It does **not** embed or spawn the backend.
- The **browser** frontend (Quasar dev server, `http://localhost:9001`) and the
  **desktop app** share the **same** local backend and the **same** PostgreSQL
  database.
- PostgreSQL is **not** bundled — it must be installed and running separately
  (by default at `localhost:5432`, database `worksync`).

### One-click launcher

Use `start-WorkSync.bat` (at the project root) to get everything running with a
single double-click:

1. Checks whether the local backend on `http://localhost:3000/api/health` is
   already responding.
2. If the backend is **not** running, starts it in its own window via
   `start-backend.cmd`.
3. Polls the health endpoint until it responds successfully.
4. Launches the installed `WorkSync.exe`
   (`%LOCALAPPDATA%\Programs\WorkSync\WorkSync.exe`) or, for development, the
   packaged app at `release\win-unpacked\WorkSync.exe`.

The launcher never starts a duplicate backend, does not modify PostgreSQL, and
does not expose anything publicly. The backend it starts keeps running so
subsequent launches are fast.

## Project Structure

```
WorkSync/
├── backend/
│   ├── config/        # Environment, PostgreSQL pool configuration
│   ├── controllers/   # Request handlers (auth, tasks, leaves, reports, ...)
│   ├── middleware/    # Authentication, authorization, rate limiting, errors
│   ├── migrations/    # PostgreSQL schema + SQLite→PostgreSQL data migration
│   ├── models/
│   ├── routes/        # Express routers
│   ├── storage/       # Uploaded task attachments
│   ├── test/          # Integration test suite
│   └── utils/         # Services (notifications, deadlines, activity, ...)
├── frontend/          # Quasar/Vue 3 SPA
├── electron/          # Electron main process
├── package.json
├── start-WorkSync.bat # One-click Windows launcher
├── start-backend.cmd  # Detached backend starter used by the launcher
├── .env.example
├── .gitignore
└── README.md
```

## Database

The current application uses **PostgreSQL**, not SQLite. The runtime database
layer uses `pg.Pool` with parameterized queries (`$1, $2, ...`) and standard
PostgreSQL transactions.

Migration files in `backend/migrations/`:

- `001_create_postgres_schema.sql` — creates the full PostgreSQL schema
  (departments, users, employees, tasks, announcements, leave_requests,
  labels, task collaboration tables, notifications, notification preferences,
  employee_imports). Idempotent where practical; intended for an empty
  `worksync` database.
- `002_migrate_sqlite_to_postgres.js` — one-time data migration from a legacy
  SQLite database (opened read-only) into PostgreSQL inside a single
  transaction. It preserves explicit IDs and password hashes exactly, and
  aborts if PostgreSQL already contains data. The source SQLite file defaults
  to `%APPDATA%\WorkSync\database\worksync.sqlite` and can be overridden with
  the `WORKSYNC_SQLITE_DB` environment variable.

The PostgreSQL database itself is not stored in this repository — it runs on
your own PostgreSQL server.

## Environment Setup

1. Clone the repository.
2. Install root dependencies (required for Electron/electron-builder):

   ```bash
   npm install
   ```

3. Install frontend dependencies:

   ```bash
   npm install --prefix frontend
   ```

4. Install backend dependencies:

   ```bash
   npm install --prefix backend
   ```

5. Copy `.env.example` to `.env` at the project root:

   ```bash
   copy .env.example .env
   ```

6. Edit `.env` and configure your real PostgreSQL credentials
   (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`) plus a secure
   `JWT_SECRET`. Never commit `.env`.

7. Make sure PostgreSQL is running and the `worksync` database exists
   (create it with your preferred tool, e.g.
   `CREATE DATABASE worksync;` in `psql`).

8. Apply the schema if the database is empty:

   ```bash
   psql -U postgres -d worksync -f backend/migrations/001_create_postgres_schema.sql
   ```

   If you are migrating from an existing legacy SQLite installation, run the
   data migration instead (after applying the schema):

   ```bash
   node backend/migrations/002_migrate_sqlite_to_postgres.js
   ```

## Development

There is no single root `npm run dev` command. Use separate terminals for each
process:

```bash
# Terminal 1 — backend API on http://localhost:3000
npm run dev:backend

# Terminal 2 — Quasar dev server on http://localhost:9001
npm run dev:frontend
```

To run the desktop shell against the development environment (it loads the
dev frontend at `http://localhost:9001` when not packaged):

```bash
npm run dev:electron
```

Other available root scripts:

| Script | Purpose |
| --- | --- |
| `npm start` | Start the Electron app |
| `npm run build:frontend` | Build the Quasar SPA only |

> **Note:** `npm run prep:backend` was removed, because the backend is no longer
> bundled into the Electron package. The backend runs as a separate local
> process (started by the launcher or `npm --prefix backend start`).

## Production / Electron Build

Build the packaged desktop application:

```bash
npm run dist
```

This command:

1. Builds the Quasar frontend SPA (`build:frontend`)
2. Packages the Electron application with electron-builder
3. Produces the Windows installer

The backend is **not** bundled into the package — the packaged app assumes the
local backend is already available on `http://localhost:3000` (run
`start-WorkSync.bat` or start `backend/server.js` yourself).

Output is written to `release/`:

- `release/win-unpacked/WorkSync.exe` — unpacked application
- `release/WorkSync-Setup-1.0.0.exe` — NSIS Windows installer

### PostgreSQL Configuration

The Electron app does **not** bundle `.env` or any database configuration. The
standalone backend process reads its credentials from the project `.env` at the
project root (`backend/config/env.js`). `.env` itself is ignored by Git — real
credentials must never be committed.

## Security Notes

- Never commit `.env`.
- Never commit real database passwords or production secrets.
- Use `.env.example` as a template only, with placeholder values.
- Configure PostgreSQL credentials securely for your target environment
  (strong passwords, least-privilege roles, TLS where appropriate).
- A desktop application that contains database credentials has different
  security considerations from a traditional server-side deployment: anyone
  with access to an installed copy can read its bundled configuration. Treat
  the database account used by the desktop app accordingly (restrict its
  privileges and network reach), and do not assume the credentials are secret
  from the machine running the application.

## Testing

Basic verification process:

1. **PostgreSQL connectivity** — confirm the service is running and reachable:
   ```bash
   psql -U postgres -d worksync -c "SELECT COUNT(*) FROM users;"
   ```
2. **Database schema** — confirm all tables exist:
   ```bash
   psql -U postgres -d worksync -c "\dt"
   ```
3. **Backend startup** — start the API and check health:
   ```bash
   npm run dev:backend
   ```
   then open `http://localhost:3000/api/health`.
4. **Frontend startup** — run `npm run dev:frontend` and open the printed URL.
5. **Login and core functionality** — log in through the UI and exercise
   dashboards, tasks, leaves, announcements, notifications, and reports.
6. **Backend integration tests** — the suite in `backend/test/` runs against
   an isolated temporary database fixture (see `backend/TESTING.md`):
   ```bash
   npm test --prefix backend
   ```
7. **Electron packaged build** — run `npm run dist`, then launch
   `release/win-unpacked/WorkSync.exe` and verify login and core features.

## Repository Status

WorkSync's runtime is PostgreSQL-only. References to SQLite that remain in the
repository are limited to historical migration tooling
(`backend/migrations/002_migrate_sqlite_to_postgres.js`), the isolated-database
test fixture, and diagnostic scripts — they are not part of normal application
startup or runtime.