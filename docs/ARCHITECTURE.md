# ShopEase — Architecture

## 1. Topology

```
┌────────────────────────────────────────────────────────────┐
│  Browser (SPA)                                             │
│  src/app/page.tsx → src/components/shopkart/spa-root.tsx   │
│    └─ dynamic(ssr:false) → app.tsx (view switch)           │
│       views/<view>.tsx  (30+ views, zustand useNav)        │
│       TanStack Query → fetch('/api/…', same-origin)        │
└───────────────▲────────────────────────────────────────────┘
                │ REST + httpOnly cookie session
┌───────────────┴────────────────────────────────────────────┐
│  Next.js route handlers  (src/app/api/**/route.ts)         │
│  try/catch → handleApiError · zod parseBody · ok()/fail()  │
│                                                            │
│  Foundation modules (src/lib)                              │
│   auth.ts       JWT cookie sessions, RBAC guards           │
│   pricing.ts    computeCartPricing, validateCoupon (1× SSOT)│
│   inventory.ts  reserve/convert/release/sweep (atomic SQL) │
│   orders.ts     fulfilments, status sync, cancel, refunds  │
│   payments/     sandbox provider, signed webhooks          │
│   logistics/    mock courier, tracking chain               │
│   http.ts  money.ts  json.ts  ids.ts  audit.ts             │
│   rate-limit.ts (in-memory)  constants.ts (status machines)│
└───────────────▲────────────────────────────────────────────┘
                │ Prisma 6
        ┌───────┴───────┐
        │ SQLite (dev)  │  → swap provider for Postgres in prod
        └───────────────┘
```

**Why a modular monolith:** the MVP needs transactional integrity across cart → order →
inventory → payment → fulfilment. One process + one database gives real ACID
transactions without network fan-out. Module boundaries (`src/lib/*`) are drawn where
future extraction would happen (payments, logistics are already adapter-shaped).

## 2. Single-page storefront

The preview environment serves only `/`, so the storefront is a **client-side SPA**:
`spa-root.tsx` mounts the app with `dynamic(..., { ssr: false })`. Rationale:

- The app is inherently client-stateful: cookie session bootstrap, localStorage
  (recently-viewed), zustand navigation, TanStack Query caches — SSR would require a
  hydration/dehydration pipeline and would reintroduce mismatch risk for zero SEO gain
  in this sandboxed preview.
- Rendering client-only eliminates the entire class of SSR/CSR hydration mismatches
  (a real hydration error was observed and fixed this way).

Views live in `src/components/shopkart/views/*.tsx` and are switched by the
`useNav` zustand store (`navigate/back/replace` + view params). Full-screen dashboards
(seller/admin) render their own chrome; customer views share the header/footer shell.

## 3. Money & pricing

- **Integer paise everywhere** (`money.ts: formatINR, rupeesToPaise`). No floats, no Decimal.
- `pricing.ts: computeCartPricing` is the **single source of truth**: recomputes line
  totals from the DB, applies the coupon (PERCENT/FLAT, min-order, max-discount,
  per-user/global limits), computes shipping per seller group (free above threshold,
  COD fee), and returns the canonical `CartPricingView`.
- Used identically by cart view, checkout validate and order creation — the client
  never sends prices.

## 4. Inventory concurrency

- Order creation reserves stock inside the order transaction:
  `InventoryReservation(status=ACTIVE, expiresAt=TTL)` with atomic `UPDATE … WHERE
  available >= qty` guards (raw SQL via Prisma) — oversell is impossible under races.
- Prepaid capture **converts** reservations into stock deductions (inside the webhook
  settlement transaction). COD conversion happens on DELIVERED. Expiry/cancel frees
  reservations; a sweep runs opportunistically on cart/checkout reads.
- Available quantity is always `onHand − reserved(ACTIVE)`.

## 5. Orders & fulfilments

- One order → N `Fulfillment` records **grouped by seller** (multi-vendor carts split).
- `OrderItem` rows are immutable snapshots (name, SKU, image, unitPrice, listPrice,
  commissionBps, returnDays) — catalogue edits never mutate history.
- Status machines in `constants.ts` with `canTransition()` guards on every transition;
  order status derives from fulfilment statuses (`syncOrderStatusFromFulfillments`),
  which also marks COD payments PAID and converts reservations at delivery.
- Cancellation is only allowed before shipping and releases reservations/refunds prepaid.

## 6. Payments (sandbox provider)

- `createSandboxPayment` → PENDING row + PaymentEvent(CREATED).
- The sandbox gateway page posts to `/api/payments/[id]/sandbox-pay` which **builds a
  signed webhook payload and pushes it through the same `processSandboxWebhook` path**
  a real provider would (HMAC-SHA256 over raw body, `x-sk-signature` header).
- Settlement is idempotent (`providerRef` unique), handles `AMOUNT_MISMATCH`,
  records every event with `signatureValid`, and never trusts a client-side
  "success". Failure outcome releases reservations and cancels the order.
- COD creates a PENDING COD payment collected on delivery; refunds (returns) mark
  payments REFUNDED/PARTIALLY_REFUNDED with anti-duplicate guards.

## 7. Auth & security model

- Sessions: JWT in an httpOnly, same-origin cookie (`SESSION_SECRET`), bcrypt hashes,
  8+ password policy. Guards: `requireUser / requireSeller / requireAdmin`.
- Every object access verifies ownership (orders, addresses, returns, payments,
  tracking) → IDOR-safe. Zod validates every mutating body. In-memory rate limits on
  register/login/checkout/payment/webhook routes. Audit log records actor + IP + meta
  for every money-affecting action.

## 8. Data model (30+ models)

User/Role/Permission/CustomerProfile/Address · Seller/SellerVerification ·
Category/Brand/Product/ProductImage/ProductVariant/Inventory/SellerOffer ·
Cart/CartItem/Wishlist/WishlistItem · Coupon/CouponRedemption ·
Order/OrderItem/Fulfillment/Payment/PaymentEvent/Shipment ·
ReturnRequest/ReturnItem/Refund · Review · Notification/SupportTicket/TicketMessage ·
AuditLog/Banner/AnalyticsEvent/InventoryReservation/Settings.

SQLite constraints shape the schema: no enums (string statuses validated by
`constants.ts`), no native JSON (String columns + `json.ts` helpers), no Decimal
(Int paise). Migrating to Postgres is a provider swap + enum tightening.

## 9. Performance notes

- Faceted search is SQL `contains` over indexed columns with facet computation over the
  pre-refinement set — p95 well inside budget for seeded volumes. Next step for scale:
  Postgres full-text (tsvector) or Meilisearch behind the same route contract.
- Caching: TanStack Query staleTimes client-side; in-memory rate limiting. A production
  deployment adds Redis for rate limits, reservation sweeps and hot caches.
