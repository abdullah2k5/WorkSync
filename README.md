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

```
Electron desktop application
  → packaged frontend (Quasar SPA served by a local HTTP server)
  → Node/Express backend (forked child process on localhost:3000)
  → PostgreSQL database
```

The backend runs locally inside the packaged Electron application as a forked
child process and communicates with a PostgreSQL server over TCP. PostgreSQL is
**not** bundled inside the application — it must be installed and running
separately (by default at `localhost:5432`, database `worksync`).

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

# Terminal 2 — Quasar dev server (URL printed by Vite, normally http://localhost:9000)
npm run dev:frontend
```

To run the desktop shell against the development environment:

```bash
npm run dev:electron
```

Other available root scripts:

| Script | Purpose |
| --- | --- |
| `npm start` | Start the Electron app |
| `npm run build:frontend` | Build the Quasar SPA only |
| `npm run prep:backend` | Install backend production dependencies only |

## Production / Electron Build

Build the packaged desktop application:

```bash
npm run dist
```

This command:

1. Builds the Quasar frontend SPA (`build:frontend`)
2. Prepares backend production dependencies (`prep:backend`)
3. Packages the Electron application with electron-builder
4. Produces the Windows installer

Output is written to `release/`:

- `release/win-unpacked/WorkSync.exe` — unpacked application
- `release/WorkSync-Setup-1.0.0.exe` — NSIS Windows installer

### PostgreSQL Configuration in the Packaged App

The packaged application bundles its environment configuration as an Electron
resource (`resources/.env`). On startup, the Electron main process reads the
PostgreSQL settings from that resource and passes them to the forked backend
child process. The database password is never written to console output — logs
only indicate whether a password is configured.

`.env` itself is ignored by Git. Real credentials must never be committed;
update the packaged resource through your build pipeline, not by editing
tracked files.

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