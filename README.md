# BusinessMithra

All-in-one business software (CRM + ERP) for small businesses: Sales, Marketing, Accounts, Operations, HR, R&D and Management, with reports. Separate product — no connection to DiscountMithra.

## Phase 1A (this code)

- Business signup in 3 steps (details → business type → owner account), 30-day free trial
- Login / logout (email + password, secure cookie)
- Modules auto ON per business type; owner can switch them ON/OFF
- Staff accounts and roles with per-module View / Add / Edit / Delete permissions
- Dashboard shell with sidebar that shows only allowed modules
- Every table has `businessId`; every query filters by it (one business never sees another's data)

## Folders

```
server/   Node.js + Express API, Prisma (Postgres on Neon)
web/      React + Vite + Tailwind web app (built and served by the server)
render.yaml  One Render web service = API + web app on one URL
```

## Deploy (Neon + Render)

1. **Neon** → New Project "businessmithra" → copy the connection string.
2. **Render** → New → Blueprint → pick this GitHub repo → it reads `render.yaml`.
3. When Render asks for `DATABASE_URL`, paste the Neon connection string. (`JWT_SECRET` is generated automatically.)
4. Click **Apply**. The first build takes ~5 minutes and creates the database tables.
5. Open the Render URL → **Create free account** → sign up your first business.

## Run locally (optional)

```
cd server && cp .env.example .env   # fill DATABASE_URL and JWT_SECRET
npm install && npx prisma db push && npm run dev
cd ../web && npm install && npm run dev   # http://localhost:5173
```

## API (Phase 1A)

| Method | Path | Who |
| --- | --- | --- |
| POST | /api/auth/signup, /api/auth/login, /api/auth/logout | public |
| GET | /api/auth/me | logged in |
| GET/PUT | /api/settings/business, /api/settings/modules | owner |
| GET/POST, PUT /:id | /api/staff | owner |
| GET/POST, PUT /:id | /api/roles | owner |

Middleware for later phases: `requireModule('sales')`, `requirePermission('sales', 'add')`.

## Next: Phase 1B

Customers & Leads (customers list/profile, leads pipeline, follow-up reminders).
