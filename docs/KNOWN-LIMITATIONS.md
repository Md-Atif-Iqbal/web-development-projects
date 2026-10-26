# ShopEase — Known Limitations & Production-Readiness Checklist

Honest inventory of what the MVP does **not** do, and what stands between it and a
real production deployment. The core commerce flows (catalogue → cart → server-validated
pricing → reserved inventory → paid/verified orders → fulfilment → returns/refunds →
admin/audit) are production-shaped; the gaps below are the deliberate MVP boundaries.

## A. Functional limitations (by design, MVP scope)

1. **Payments are sandbox-only.** The in-app gateway exercises signed webhooks and
   idempotent settlement, but it is not a real PSP. No real UPI/cards move money.
   A sandbox banner is shown on the payment page, order confirmation and footer.
2. **Logistics is a mock courier** (`MOCK_LOGISTICS`): tracking events advance
   manually via the admin console (`/api/admin/shipments/[trackingNumber]/advance`).
   Real carrier integration (Delhivery/Bluedart/Shiprocket) needs an adapter with
   label purchase, pickup scheduling and webhook-driven tracking.
3. **No real e-mail/SMS.** Notifications are in-app only. OTP login, order e-mails
   and SMS need a provider (SMTP/Twilio/Gupshup). Phone numbers are stored but not verified.
4. **Images are served from `/public`** (seed + file path on the product form);
   there is no upload pipeline/CDN. A seller can only reference image paths —
   production needs S3/GCS + signed uploads + an image resizing proxy (sharp is installed).
5. **Single currency/locale**: INR paise, English UI. next-intl is installed but
   translations are not populated. GST is captured per seller/commission but no
   tax-invoice PDF generation (the order page shows an invoice view; a real GST
   invoice PDF + e-invoicing needs an invoice service).
6. **Search is SQL LIKE-based** with facet counts computed pre-refinement (facets
   don't shrink as you refine). Fine for the seeded catalogue; swap for Postgres
   FTS/Meilisearch at scale. No typo tolerance/fuzzy matching.
7. **Reviews are verified-purchase only** and 1-per-user-per-product (upsert).
   There is no photo review, seller feedback loop, or Q&A.
8. **Coupons**: percent/flat with min-order, max-discount, per-user + global usage
   limits — but no product/category-scoped coupons, no stacking, no automatic
   first-order coupons.
9. **Exchange orders** are modelled (`ReturnRequest.type=EXCHANGE`,
   `EXCHANGE_SHIPPED` status) but the admin/seller UI optimises the money-return
   path; exchange shipping is manual.
10. **Support** is a simple two-party ticket thread (customer ↔ admin) with
    statuses; no SLA routing, canned replies, or CSAT.
11. **Wishlist is single, private** — no sharing, no price-drop alerts.
12. **Recently-viewed** lives in localStorage (per browser), not synced to the account.

## B. Technical debt / hardening gaps

1. **Rate limiting is in-memory** (per-instance, resets on deploy). Move to Redis
   (or a durable store) before multi-instance deployment.
2. **Reservation TTL sweep is opportunistic** (runs on cart/checkout reads), not a
   scheduled job. Deploy a cron (see DEPLOYMENT.md §6).
3. **No automated test suite** (spec allowed focusing effort on the working system;
   all flows were verified end-to-end in the browser). Priority next step: Vitest
   unit tests for `pricing.ts`, `inventory.ts`, `constants.canTransition`, and
   Playwright E2E for checkout + payment webhook paths.
4. **Observability**: console logging only; add structured logs, error tracking,
   metrics, tracing. Analytics events are written but there is no analytics dashboard.
5. **Sessions**: JWT cookie cannot be revoked server-side before expiry (suspend
   takes effect on next request via the status check, but a stolen token remains
   valid until expiry). Production: short TTL + refresh tokens or a session table.
6. **CSRF**: mutations are JSON-only with `SameSite=Lax` cookies + same-origin
   fetches, which blocks classic CSRF, but a strict token (or `SameSite=Strict`)
   plus origin checks in middleware would harden further.
7. **Secrets in dev fallbacks**: `SESSION_SECRET`/`SANDBOX_WEBHOOK_SECRET` fall back
   to dev constants when unset — deployment MUST set real secrets (guard added to
   the checklist; consider fail-fast in production).
8. **SQLite file DB** — no concurrent-write scaling; switch to Postgres (provider
   swap documented) for production.
9. **No CDN/caching layer** for catalogue reads; TanStack Query staleTimes mitigate
   client-side, server responses are uncached.
10. **PII**: addresses/phone stored in plain text (normal for e-commerce), bank
    details are masked in API responses, passwords bcrypt-hashed; add field-level
    encryption + data-retention policy before real launch (India DPDP Act).

## C. Production-readiness checklist

- [ ] Real payment provider adapter + live webhooks (see DEPLOYMENT.md §5)
- [ ] Postgres + versioned migrations (`prisma migrate deploy` in CI/CD)
- [ ] Redis: rate limits, reservation sweep cron, hot caches
- [ ] Object storage for images + signed uploads + resizing
- [ ] Transactional e-mail/SMS provider + templates (order, shipped, refund)
- [ ] GST invoice PDFs + e-invoicing/e-way bill integration
- [ ] Real courier adapter + label printing + tracking webhooks
- [ ] Structured logging + Sentry + uptime probe + dashboards
- [ ] Automated tests: unit (pricing/inventory/status machines) + E2E (checkout, payments, returns)
- [ ] Load test checkout (reservation contention), tune DB indexes from real query plans
- [ ] Security review: dependency audit, pen-test auth/IDOR, secrets rotation runbook
- [ ] Legal: final Privacy Policy/Terms reviewed by counsel; DPDP data-retention policy; consumer-protection disclosures (seller GSTIN display, warranty terms)
- [ ] Admin: 2FA for admin accounts; just-in-time access policy for support roles

## D. Verified in this build (for reviewers)

All flows below were executed end-to-end in a real browser against the running app:

- Login (all three roles), logout, session persistence, RBAC isolation
- Home → category/search → product detail → offer/variant selection → add to cart
- Cart quantity/coupon rules (per-user limit enforced server-side: "You have already
  used this coupon"), price recompute (₹4,999 → ₹4,499 with FESTIVE500)
- Checkout → sandbox UPI payment → **order confirmed only via webhook verification**
  (order timeline literally shows "Payment verified via webhook")
- Order detail timeline, payment PAID/SANDBOX provider badge, invoice view, cancel guard
- Seller Hub: real stats; Confirmed → Processing → Packed → Shipped with tracking
  number issued (`ML15DB1173D6`); seller returns queue (approve/reject)
- Admin Console: stats cross-verified against direct DB queries (sellers=3, pending=1,
  products=17, orders today=8); seller approval (FreshFashions) with audit entry;
  audit trail shows the full chain ORDER_PLACED → PAYMENT_CAPTURED →
  FULFILLMENT_STATUS_UPDATED ×3 → SELLER_APPROVED
- Mobile responsive layout with bottom nav; light/dark themes; footer flush with
  viewport bottom (gap = 0); empty states (zero-result search)
- `bun run lint` clean, `tsc --noEmit` clean, dev server log free of runtime errors
