# WorkSync

Phase 1 provides authentication and role-based dashboards for Admin, Manager, and Employee users.

## Prerequisites

- Node.js 20 or later

## Setup

```bash
copy .env.example .env
npm install --prefix backend
npm install --prefix frontend
npm run setup:db
```

The seed creates these development accounts (change or remove them outside development):

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@worksync.com | Admin@123 |
| Manager | manager@worksync.com | Manager@123 |
| Employee | employee@worksync.com | Employee@123 |

## Run

Use two terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

Open the frontend URL printed by Vite (normally `http://localhost:9000`). The API runs at `http://localhost:3000`.

## API

- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token required)
- `GET /api/health`
