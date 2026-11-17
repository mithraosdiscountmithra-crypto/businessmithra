# BusinessMithra

All-in-one business software (CRM + ERP) for small businesses: Sales, Marketing, Accounts, Operations, HR, R&D and Management, with reports. Separate product — no connection to DiscountMithra.

## Built so far

**Phase 1B–1D · Sales & Customers:** leads pipeline (New → Contacted → Quotation → Won/Lost, won leads become customers), customers with purchase history and dues, follow-up reminders, items & services with HSN and GST, quotations (convert to invoice in one click), GST invoices (CGST/SGST or IGST, discount, round-off, amount in words, print/PDF, WhatsApp share with a public customer link), payments and partial payments, sales reports (daily sales, top customers, staff-wise, dues aging, lead conversion), live dashboard numbers.

**Phase 2 · Accounts:** cash/bank/UPI accounts with opening balances and live balances, expenses with categories and input GST, day book with running balance, Profit & Loss, GST summary by rate (GSTR-1/3B ready data), cash flow by payment mode.

**Online Shop:** every business gets its own shop page (`/s/<shop-link>`) with logo, cover, categories, product photos, MRP/discount, cart, store pickup or home delivery, appointment booking for services, questions that become Leads, order status page with UPI pay link and WhatsApp send-to-shop, QR code for the counter. Vendor side: Online Orders with auto-refresh and sound, confirm/ready/complete, mark paid, one-click GST invoice. Photo upload uses Cloudinary (set `CLOUDINARY_*` env vars on Render); without it, image links can be pasted.

**Plans & Super Admin:** Free / Basic / Pro plans (prices, users, modules editable by super admin), 7-day trial, vendor Plan & Billing page with offline payment requests (cash / UPI / bank), super admin at `/admin` (env login) with platform stats (MRR, signups, trial/paid/expired), businesses list and detail (extend trial, set plan, block, private notes), request approve/reject. Expired businesses can only open Plan & Billing; their shop closes; data is kept.

## Phase 1A

- Business signup in 3 steps (details → business type → owner account), 7-day free trial
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

## Next: Phase 3 – Operations

Stock / inventory linked to items and invoices, suppliers, purchase orders, tasks.
