# ShopEase — Deployment Guide

## 1. Requirements

- Node.js 20.9+ (LTS recommended) — `npm` is the package manager (`package-lock.json` committed)
- A database: **SQLite** (default, zero-config) or **PostgreSQL/MySQL** for production

## 2. Environment

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | `file:../db/dev.db` (dev, relative to `prisma/`) · `postgres://…` (prod) |
| `SESSION_SECRET` | ✅ prod | 48+ random bytes — signs the session JWT cookie (`openssl rand -base64 48`) |
| `SANDBOX_WEBHOOK_SECRET` | ✅ prod | 32+ random bytes — HMAC secret for payment webhook signatures |

No other secrets are required for the MVP: payments/logistics/email use sandbox
adapters (see `.env.example` for the optional real-provider slots).

## 3. Database

```bash
npm run db:push          # push prisma/schema.prisma
npm run db:seed          # optional: demo catalogue, sellers, users, orders
```

**Production migrations:** switch from `db push` to versioned migrations:

```bash
npx prisma migrate dev --name init    # creates prisma/migrations/*
npx prisma migrate deploy             # applies pending migrations (CI/CD)
```

When moving to PostgreSQL, change `provider = "postgresql"` in
`prisma/schema.prisma`, update `DATABASE_URL`, and re-run `migrate deploy`.
Consider tightening String statuses into native enums and moving JSON-in-String
columns (`highlights`, `specifications`, `statusHistory`, shipment `events`) to
`Json` columns — `src/lib/json.ts` centralises the parsing so the change is local.

## 4. Build & run

```bash
npm ci                   # reproducible install from package-lock.json
npx prisma generate
npm run build            # next build (type-checked)
npm run start            # next start — or run behind a reverse proxy
```

Deploy behind a reverse proxy (nginx/Caddy/ALB) that:

1. Terminates TLS (session cookie gets `secure` automatically when `NODE_ENV=production`).
2. Forwards `/api/webhooks/payments/*` untouched — the raw body is required for
   HMAC verification (do not parse/re-serialize the body before it reaches the route).
3. Sets `X-Forwarded-For` (client IP is used for rate limiting and audit logs).

## 5. Webhook configuration (real provider)

The sandbox webhook lives at `POST /api/webhooks/payments/sandbox` and is verified
with `SANDBOX_WEBHOOK_SECRET` (HMAC-SHA256, hex-encoded, header `x-sk-signature`).
To go live with Razorpay (or similar):

1. Implement a provider adapter beside `src/lib/payments/sandbox.ts` exposing
   `createPayment` (order creation) and `processWebhook` (signature-verified
   settlement) — the settlement logic (idempotency, reservation conversion, coupon
   redemption, order status sync) is already centralised and provider-agnostic.
2. Point the provider dashboard at `/api/webhooks/payments/<provider>`.
3. Keep the client out of the trust chain: the client never reports success; the
   order page polls `/api/payments/[id]/status` which reads server state only.

## 6. Background jobs

The MVP runs sweeps opportunistically (expired reservations) and advance-shipment
transitions manually (admin). For production, schedule:

- `sweepExpiredReservations()` every minute
- Mock/courier `advanceShipment()` polling or real carrier webhooks
- Abandoned-order cancellation (PENDING_PAYMENT older than TTL)
- Analytics rollups for the admin dashboard

Use a cron trigger (or your platform's scheduler) hitting protected internal routes
or a worker consuming the same `src/lib` modules — they are all plain functions.

## 7. Observability & operations checklist

- [ ] Structured logging (route handlers already funnel errors through `handleApiError` — add a JSON logger there)
- [ ] Error tracking (Sentry) + `/api/health` uptime probe
- [ ] DB backups + restore drill (SQLite: file snapshots; Postgres: PITR)
- [ ] Rate-limit store moved to Redis (see KNOWN-LIMITATIONS.md)
- [ ] Rotate `SESSION_SECRET` with a staged rollout (sessions invalidate on rotation)
- [ ] Load test the checkout path (reservation contention is the critical section)

## 8. Local workspace notes

Local development serves the app with `npm run dev` on port 3000. The SQLite file
(`db/dev.db`) persists between restarts and the seed data is optional but recommended.
