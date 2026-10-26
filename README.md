<<<<<<< HEAD
# ShopEase — Everything You Love, All in One Place

<p align="center">
  <img src="public/brand/logo-full.svg" alt="ShopEase logo" width="280">
</p>

A complete, runnable **multi-vendor e-commerce marketplace MVP** for the Indian market.
Flipkart-inspired shopping experience with an original brand, design system and codebase.
Everything works end-to-end — no UI mock-ups: auth, catalogue, cart, server-validated
pricing, concurrency-safe inventory, orders, sandbox payments with verified webhooks,
fulfilment, tracking, returns & refunds, seller hub, admin console and an audit trail.

> **Sandbox notice:** payments run through an in-app **sandbox gateway** (clearly labelled
> everywhere) that exercises the same signed-webhook verification path a production
> provider (e.g. Razorpay) would. **No real money moves.** Logistics use a **mock courier**
> adapter with a full tracking chain. Password-reset emails use a **sandbox console
> delivery** mock unless a real provider key is configured. The app never pretends a real
> payment succeeded, a real shipment was created, or a real email was sent.

This README targets **Windows 11 + Visual Studio Code** users. macOS/Linux users can
follow the same steps — only the shell syntax for copying `.env.example` differs.

---

## A. Project Overview

ShopEase is a full marketplace, not a demo storefront:

**Customer storefront (single-page app at `/`)**
- Home — hero banner carousel, category tiles, coupons, deals of the day, best sellers, new arrivals, recently viewed
- Catalogue & search — text search, category tree, brand/price/rating/in-stock facets, 6 sort orders, suggestions dropdown, empty states
- Product detail — gallery, variant picker, multiple seller offers (price-sorted), stock indicator, delivery (PIN) check, reviews & ratings (verified-purchase only), specifications
- Cart — grouped by seller, quantity stepper, save for later, coupon apply/remove with eligibility rules, server-computed price summary
- Checkout — address book (CRUD, default selection), order review, COD eligibility (cap rules), coupon, price breakdown
- Payments — UPI / Card / Netbanking / Wallet via the **sandbox gateway**; success **and** failure outcomes; COD
- Account security — "Forgot password?" with single-use reset link (30-min expiry, hashed tokens, rate-limited, anti-enumeration responses), sessions revoked after a reset
- Orders — status timeline, payment status, per-seller fulfilments, tracking, invoice view, cancellation
- Returns — return window enforcement, reason codes, duplicate protection, RMA tracking, refund status
- Wishlist, notifications, profile, support tickets — all functional

**Seller Hub**
- Onboarding with verification details (bank info masked in responses)
- Dashboard with real computed stats (products, orders to process, revenue, earnings after commission, low stock, pending returns, 14-day revenue chart)
- Product management (create/edit with variants, images, inventory, moderation status)
- Order processing: Confirmed → Processing → Packed → Shipped (tracking number issued by the mock courier) with returns handling
- Finance view: earnings, commission, fulfilment ledger

**Admin Console**
- Dashboard with live stats — cross-verified against the database (no hardcoded numbers)
- Seller verification (approve/reject/suspend), product moderation
- Orders oversight, payments ledger, returns & refund decisions, category/brand/coupon management
- User management (suspend/activate), support tickets, audit log of every money-affecting action

## B. Technology Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5 |
| UI | Tailwind CSS 4 + shadcn/ui (New York style), lucide-react, sonner, next-themes |
| State | TanStack Query (server state) · zustand (in-app navigation) |
| Backend | Next.js Route Handlers (REST API under `src/app/api/**`) |
| Database | SQLite via Prisma 6 ORM (swap provider in `prisma/schema.prisma` for Postgres/MySQL) |
| Auth | Custom JWT session cookie — bcrypt hashing, `jose` signing, httpOnly + same-origin |
| Payments | In-app sandbox gateway + HMAC-SHA256 signed webhooks, idempotent settlement |
| Logistics | Mock courier adapter with LABEL_CREATED → … → DELIVERED chain |
| Email | Resend HTTP adapter (optional) + labelled sandbox console delivery in dev |

**Money is stored as INTEGER PAISE everywhere.** Never use floats. Format with `formatINR()` from `@/lib/money`.

## C. Prerequisites

| Software | Minimum | Recommended | Notes |
|---|---|---|---|
| **Node.js** | 20.9.0 (LTS) | 22.x or 24.x LTS | Required by Next.js 16. Check: `node -v` |
| **npm** | 10.x | bundled with Node.js | Check: `npm -v` |
| **VS Code** | any recent | latest | With the built-in TypeScript support; ESLint extension optional |
| **Internet access** | — | — | Needed for `npm install` and the first `next dev`/`next build` (Google Fonts download via `next/font`, cached afterwards) |

No other services are required — the database is a local SQLite file and all third-party
integrations (email, payments, logistics) have local sandbox fallbacks.

## D. Download and Extract

1. Get `ShopEase-Source-Code-Windows11.zip` and move it to a **short, simple path**,
   e.g. `C:\dev\` — avoid OneDrive-synced folders and paths with special characters.
2. Right-click the ZIP → **Extract All…** → choose `C:\dev\` → Finish.
3. You should now have `C:\dev\ShopEase\` containing `package.json`, `src\`, `prisma\`, etc.

> Windows path-length limits can break `npm install` in deeply nested folders.
> A short path like `C:\dev\ShopEase` avoids the problem entirely.

## E. Open in VS Code

```powershell
cd C:\dev\ShopEase
code .
```

Or: **File → Open Folder…** → select `C:\dev\ShopEase`.

VS Code may ask *"Do you trust the authors of the files in this folder?"* → click
**Yes, I trust the authors**. Recommended extensions (optional): **ESLint**
(`dbaeumer.vscode-eslint`) and **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`).

## F. Install Dependencies

Open the VS Code integrated terminal (**Terminal → New Terminal**, it opens in the
project folder) and run:

```powershell
npm install
```

`package-lock.json` is committed, so for a byte-for-byte reproducible install you can use:

```powershell
npm ci
```

This downloads ~450 MB into `node_modules\` and takes a few minutes.
The project uses **npm** as its package manager (lockfile: `package-lock.json`).

## G. Configure Environment Variables

Create your local `.env` from the included template:

```powershell
Copy-Item .env.example .env
```

Then open `.env` and review the values:

| Variable | Required? | What to put |
|---|---|---|
| `DATABASE_URL` | **REQUIRED** | Keep the default `file:../db/dev.db` — it creates/uses `<project>\db\dev.db` |
| `SESSION_SECRET` | Optional in dev, **required in production** | Any long random string. Generate: `[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))` |
| `SANDBOX_WEBHOOK_SECRET` | Optional in dev, **required in production** | Any long random string |
| `APP_BASE_URL` | Optional in dev | Leave unset locally (defaults to `http://localhost:3000`). Set in production to your public origin |
| `RESEND_API_KEY` | Optional | Only if you want real password-reset emails (free account at resend.com). Without it, dev mode prints the email to the server log and returns the link in a labelled `sandbox` field |
| `MAIL_FROM` | Optional | Sender address used with Resend |

**Security rules**

- `.env` is already listed in `.gitignore` — never commit or share it.
- `.env.example` contains placeholders only; the shipped archive contains **no** real
  secrets, keys, tokens or customer data.
- No `NEXT_PUBLIC_*` variables are used, so nothing server-side can leak to the browser.

## H. Configure the Database

ShopEase uses SQLite — **no database server installation needed**. Two commands set
everything up (run from the project root):

```powershell
# 1. Create <project>\db\dev.db and push the full schema
npm run db:push

# 2. Seed demo data: 17 products, categories, brands, 3 sellers, users,
#    coupons, banners, reviews, a demo order and a support ticket
npm run db:seed
```

Notes:

- `db:push` uses Prisma's schema-push workflow (no migration files needed). If you prefer
  migration history, run `npx prisma migrate dev --name init` once instead — both work.
- Seeding is idempotent (upserts), but re-running it refreshes the demo rows.
- **Reset the database safely:** stop the dev server, delete `db\dev.db`, then re-run
  `npm run db:push && npm run db:seed`.

### Demo accounts (seeded)

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | `admin@shopkart.in` | `Admin@123` | Full admin console |
| Customer | `riya@example.com` | `Customer@123` | Has demo orders, address, reviews |
| Seller | `seller@shopkart.in` | `Seller@123` | TechNova Retail — **approved** |
| Seller | `newbieseller@shopkart.in` | `Seller@123` | FreshFashions — approve via Admin → Sellers |

These are demo credentials created by the seed script — change them before any real use.

## I. Run the Development Server

```powershell
npm run dev
```

The first run compiles the app and downloads the Geist fonts; give it ~30 seconds.
Keep this terminal open — press `Ctrl+C` to stop the server.

To use a different port:

```powershell
npm run dev -- -p 3001
```

## J. Open the Website

Open your browser at:

```
http://localhost:3000
```

Sign in with any demo account above (Account menu → Sign In), or register a new user.
The storefront, seller hub and admin console are all served from this single URL.

## K. Build for Production

```powershell
npm run build     # type-checked production build into .next\
npm run start     # serves the production build on http://localhost:3000
```

`npm run start` requires a valid `.env` (same variables as development). For a real
deployment set `SESSION_SECRET`, `SANDBOX_WEBHOOK_SECRET` and `APP_BASE_URL` properly,
and note the caveats in `docs\KNOWN-LIMITATIONS.md` (sandbox payments, mock logistics,
in-app notifications — they are MVP boundaries, not production integrations).

## L. Testing and Code Quality

There is **no unit-test suite** in this repository; quality is enforced with:

```powershell
npm run lint        # ESLint (Next.js core-web-vitals + TypeScript configs)
npm run typecheck   # tsc --noEmit over the whole project
npm run build       # production build — also runs full type checking
```

Additionally, `scripts\verify-pwreset.ts` is a manual end-to-end check for the
password-reset flow (13 scenarios) against a running dev server:
`npx tsx scripts/verify-pwreset.ts`.

## M. Common Errors

**`node -v` below 20.9** → Next.js 16 refuses to start. Install the current Node.js LTS
from <https://nodejs.org> and reopen the terminal (`node -v` must show 20.9+).

**`npm install` fails with EPERM / path too long** → delete `node_modules`, close VS Code,
re-run `npm install` in a plain PowerShell window as a normal user (not Administrator).
Extract the project to a short path such as `C:\dev\ShopEase`. OneDrive/Dropbox-synced
folders cause file locks — move the project out of them.

**Port 3000 already in use (`EADDRINUSE`)** → another process owns the port. Either stop
it (`netstat -ano | findstr :3000` then `taskkill /PID <pid> /F`) or run on another port:
`npm run dev -- -p 3001`.

**`Environment variable not found: DATABASE_URL`** or Prisma connection errors → you
skipped section **G**. Run `Copy-Item .env.example .env`, then re-run `npm run db:push`.

**`Error: querySrv ENOTFOUND` / font download failure on first dev/build** →
`next/font` downloads Google Fonts on first run; check your internet connection or
corporate proxy, then retry. It is cached afterwards.

**Database is locked / write errors** → SQLite allows a single writer. Stop other dev
server instances or editors holding the DB, then retry. Never open `dev.db` in a tool
that locks it while the app is running.

**"Migration engine" or `prisma migrate` errors** → this project uses the `db push`
workflow and ships no migrations folder. Use `npm run db:push`; only use
`prisma migrate dev` if you intentionally want to start a migration history.

**Password-reset emails never arrive** → no email provider is configured (expected).
In development the reset link is printed in the dev-server log under
`SANDBOX MAIL DELIVERY` and returned in the API response's labelled `sandbox` field.
Configure `RESEND_API_KEY` for real delivery.

**PowerShell blocks scripts (`running scripts is disabled`)** → this applies to
`.ps1` shims, not npm itself. If needed, run:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then reopen the terminal.

**Payment page says SANDBOX / test mode** → that is correct behaviour. The sandbox
gateway is the implemented payment provider; see section **N**.

## N. External Services

| Feature | Works locally without credentials? | Needs what for production? |
|---|---|---|
| Catalogue, cart, orders, returns, seller hub, admin | ✅ Fully (SQLite + seed data) | — |
| Payments | ✅ Sandbox gateway — clearly labelled, no real money | A real PSP (e.g. Razorpay). Implement an adapter behind `src/lib/payments/`; env vars are pre-listed in `.env.example` |
| Order tracking | ✅ Mock courier adapter (`MOCK_LOGISTICS`), admin advances shipments | A carrier API adapter behind `src/lib/logistics/` |
| Password-reset email | ✅ Sandbox console delivery (link in server log + API `sandbox` field) | `RESEND_API_KEY` (+ optional `MAIL_FROM`) — free tier at resend.com |
| Notifications | ✅ In-app notification centre | SMS/push providers (adapters to be added) |
| Product images | ✅ Static files in `public\` | An upload pipeline + object storage (S3/GCS) — see `docs\KNOWN-LIMITATIONS.md` |
| Fonts | ✅ (after first download) | Internet on first `dev`/`build` |

## O. Security

- **Never commit `.env`.** It is ignored by `.gitignore`; keep it that way. If a secret
  ever leaks, rotate it (`SESSION_SECRET` rotation invalidates all sessions).
- Use long random values for `SESSION_SECRET` and `SANDBOX_WEBHOOK_SECRET` in production.
- The archive you received contains no secrets, no API keys and no customer data —
  the SQLite database and `.env` are intentionally excluded.
- Built-in hardening: server-authoritative pricing & stock, concurrency-safe inventory
  reservations, signature-verified payment webhooks (client "success" is never trusted),
  order snapshots, per-route RBAC (`requireUser/requireSeller/requireAdmin`), ownership
  checks on every object access, Zod validation on mutating endpoints, rate limiting on
  auth/checkout/payment/webhook routes, bcrypt hashing, and an audit trail for
  money-affecting actions. Password reset uses 256-bit tokens stored only as SHA-256
  hashes, single-use with 30-minute expiry, and links built from `APP_BASE_URL`
  (never the request Host header).
- Keep `NEXT_PUBLIC_*` unused for server secrets — anything prefixed that way is
  readable in the browser bundle.

## P. Project Structure

```text
ShopEase\
├── src\
│   ├── app\
│   │   ├── api\            # REST API (Route Handlers): auth, products, cart,
│   │   │                   #   checkout, orders, payments, returns, admin, seller, …
│   │   ├── layout.tsx      # Root layout, metadata, PWA manifest wiring
│   │   ├── manifest.ts     # PWA manifest
│   │   ├── page.tsx        # The single page route — mounts the storefront SPA
│   │   └── globals.css     # Tailwind 4 theme tokens (brand colours, dark mode)
│   ├── components\
│   │   ├── shopkart\       # App modules: header, footer, views\* (catalog, cart,
│   │   │                   #   checkout, orders, seller hub, admin console, …)
│   │   └── ui\             # shadcn/ui component kit
│   ├── hooks\              # use-mobile, use-toast
│   └── lib\
│       ├── auth.ts         # JWT session (jose), requireUser/requireSeller/requireAdmin
│       ├── db.ts           # Prisma client singleton
│       ├── pricing.ts      # Server-side price computation (cart/checkout/orders)
│       ├── inventory.ts    # Atomic inventory reservations + TTL sweep
│       ├── orders.ts       # Order transactions & snapshots
│       ├── payments\       # Sandbox payment provider + HMAC webhook verification
│       ├── logistics\      # Mock courier adapter
│       ├── mail.ts         # Resend adapter + sandbox console delivery
│       ├── audit.ts        # Audit trail for money-affecting actions
│       ├── store.ts        # zustand SPA navigation store
│       ├── session.tsx     # Client session context (GET /api/auth/me)
│       ├── client\api.ts   # Typed fetch wrapper (relative /api calls)
│       └── types.ts        # Shared API types
├── prisma\
│   ├── schema.prisma       # Full data model (SQLite; swap provider for Postgres)
│   └── seed.ts             # Demo catalog, sellers, users, orders (npm run db:seed)
├── db\                     # SQLite database lives here (created by db:push)
├── public\                 # Static assets: brand\, products\, categories\, banners\
├── scripts\                # Dev utilities (brand assets, catalog checks, pwreset E2E)
├── docs\                   # ARCHITECTURE.md, CONTRACT.md (API), DEPLOYMENT.md,
│                           #   KNOWN-LIMITATIONS.md
├── package.json            # Scripts + dependencies (npm)
├── package-lock.json       # Committed lockfile — use `npm ci` for reproducible installs
├── next.config.ts          # Next.js configuration
├── tsconfig.json           # TypeScript configuration (paths: @/* → src/*)
├── eslint.config.mjs       # ESLint (flat config)
├── tailwind.config.ts      # Tailwind config (v4 reads theme from globals.css)
├── postcss.config.mjs      # PostCSS (Tailwind 4)
├── components.json         # shadcn/ui configuration
├── .env.example            # Environment template — copy to .env (section G)
├── .gitignore              # Ignores .env, node_modules, .next, databases, logs
└── README.md               # This file
```

Deeper reading: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
API contract: [`docs/CONTRACT.md`](docs/CONTRACT.md) ·
Deploy notes: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) ·
MVP boundaries: [`docs/KNOWN-LIMITATIONS.md`](docs/KNOWN-LIMITATIONS.md)

## Scripts reference

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run build` | Type-checked production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check without emitting |
| `npm run db:push` | Create/update the SQLite database from `prisma/schema.prisma` |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:seed` | Seed demo data (`tsx prisma/seed.ts`) |
| `npm run db:migrate` | Start/apply migration history (optional) |
| `node scripts/build-brand-assets.ts` | Regenerate favicon/PWA icons from the SVG logo (needs `npx tsx` prefix: `npx tsx scripts/build-brand-assets.ts`) |

## Branding assets

All ShopEase logo variants live in `public/brand/` and share one design
(orange `#FF6B35` badge, white shopping bag, warm-yellow `#FFC857` smile):
`logo-full.svg` / `logo-full-white.svg` (horizontal lockups), `logo-square.svg`
(favicon source), `logo-icon.svg` / `logo-icon-white.svg`, `logo-compact.svg`,
and the PWA icons (`icon-192.png`, `icon-512.png`, `icon-maskable-*.png`).
Favicon/app icons ship from the Next.js `src/app` file conventions
(`favicon.ico`, `icon.svg`, `apple-icon.png`) and are auto-linked. Browsers cache
favicons aggressively — after a logo change, hard-refresh with Ctrl+Shift+R.

## Known limitations

See [`docs/KNOWN-LIMITATIONS.md`](docs/KNOWN-LIMITATIONS.md) — includes the
production-readiness checklist (real payment provider, Redis-backed rate limiting,
object storage, e-mail/SMS, background workers, migrations strategy, observability).
=======
# web-development-projects
My web development projects showcasing responsive websites, creative designs, and modern web technologies.
>>>>>>> 50cb9b1db5f8e5ce4e44c3ae47367801d642a64b
