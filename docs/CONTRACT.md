# ShopEase — REST API Contract (v1)

**All money = INTEGER PAISE.** Errors always: `{ "error": { "code", "message", "details?" } }` with proper HTTP status.
Auth: httpOnly cookie session (`sk_session`). Frontend just uses `credentials: same-origin` (default in `api` client).
All routes live under `src/app/api/.../route.ts` (Next 16 App Router). NO page routes besides `/`.

**Standard libs to import (do NOT reinvent):**
- `@/lib/db` → `db`
- `@/lib/http` → `ok, fail, handleApiError, parseBody, getPagination, paginated, getClientIp, ApiHttpError`
- `@/lib/auth` → `getSessionUser, requireUser, requireRole, requireSeller, requireAdmin, hashPassword, verifyPassword, createSession, destroySession`
- `@/lib/pricing` → `computeCartPricing, validateCoupon, shippingFeeForGroup`
- `@/lib/inventory` → `reserveItems, convertReservations, releaseReservations, sweepExpiredReservations`
- `@/lib/orders` → `ensureFulfillmentsForOrder, syncOrderStatusFromFulfillments, cancelOrder, createRefundForReturn, completeRefund, notify, appendStatus`
- `@/lib/payments/sandbox` → `createSandboxPayment, processSandboxWebhook, buildWebhookPayload, markCodCollected`
- `@/lib/logistics/mock` → `createShipment, advanceShipment, getTracking, SHIPMENT_CHAIN`
- `@/lib/audit` → `logAudit`, `@/lib/rate-limit` → `rateLimit, RATE`, `@/lib/ids` → `ids`
- `@/lib/constants` → status machines, `canTransition`, `SHIPPING_CONFIG`, `RETURN_REASONS`
- `@/lib/json` → `parseJsonArray, parseJsonObject, toJson`, `@/lib/money` → `formatINR`

**Route handler skeleton:**
```ts
import { NextRequest } from "next/server";
import { ok, fail, handleApiError, parseBody } from "@/lib/http";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    // ... logic
    return ok(data);
  } catch (err) { return handleApiError(err); }
}
```

---

## Auth
| Method | Path | Auth | Body/Query | Response |
|---|---|---|---|---|
| POST | /api/auth/register | – | `{name, email, phone?, password}` (pw ≥ 8, 1 letter+1 digit) | 201 `{user: Me}`; sets session. Rate-limited 5/min. Creates CustomerProfile, Cart, Wishlist. Audit `USER_REGISTER`. |
| POST | /api/auth/login | – | `{email, password}` | 200 `{user: Me}`. 401 `INVALID_CREDENTIALS`. Suspended → 403 `ACCOUNT_SUSPENDED`. Rate-limited 10/min. |
| POST | /api/auth/logout | user | – | 200 `{ok: true}` clears cookie |
| GET | /api/auth/me | – | – | 200 `{user: Me}` or `{user: null}` (200 even when logged out!) |
| POST | /api/auth/forgot-password | – | `{email}` (normalised lower-case) | Always 200 `{ok, message: "If an account exists…"}` — anti-enumeration. Issues single-use reset token (SHA-256 hash stored, 30-min TTL, previous tokens invalidated), emails link built from `APP_BASE_URL`. Dev-only `sandbox.resetPath` returned when the console (mock) mail service is used. 422 invalid email, 429 rate-limited (5/15 min per IP, 3/15 min per email), 503 `MAIL_NOT_CONFIGURED` in production without mail config. Audit `PASSWORD_RESET_REQUESTED` (no token material logged). |
| POST | /api/auth/reset-password | – | `{token, newPassword}` (pw ≥ 8, 1 letter+1 digit) | 200 `{ok, message}` on success: transaction bumps `tokenVersion` (revokes all sessions), marks token used, deletes other outstanding tokens, bcrypt-hashes new password. 400 `TOKEN_INVALID` (same error for unknown/expired/used), 422 validation, 429 rate-limited (10/15 min per IP). Audit `PASSWORD_RESET_COMPLETED`; user notified in-app. |

## Catalog (public, cache-friendly)
| Method | Path | Auth | Query | Response |
|---|---|---|---|---|
| GET | /api/categories | – | – | `{items: Category[]}` (tree, ACTIVE only, with children) |
| GET | /api/brands | – | – | `{items: Brand[]}` |
| GET | /api/banners | – | – | `{items: BannerView[]}` (ACTIVE, sorted) |
| GET | /api/products | – | `q, category (slug), brand (slugs CSV), minPrice, maxPrice (RUPEES), rating (min), inStock ("1"), sort (relevance\|price_asc\|price_desc\|rating\|newest\|popular), page, pageSize, featured ("1"), sellerId` | `ProductListResponse` with facets. Only ACTIVE products. Card price = min across variants. `inStock` if any variant available>0. |
| GET | /api/products/[slug] | – | – | `ProductDetail` (404 if not ACTIVE/nonexistent). Tracks `PRODUCT_VIEW` analytics. Variants with availableQty. Offers: ACTIVE offers by APPROVED sellers. rating = ratingSum/ratingCount rounded 1dp. |
| GET | /api/search/suggest | – | `q` (min 2 chars) | `{items: SearchSuggestion[]}` max 8 (products by name/brand/category) |
| GET | /api/pincode/serviceability | – | `pincode` (6 digits) | `ServiceabilityResponse` — serviceable if starts with 1-6 (heuristic), metro prefixes (11,40,56,60,70,50,38,41,30,22) 2 days else 4. codAvailable true. |
| GET | /api/reviews?productId= | – | `productId, page, pageSize` | paginated `ProductReview[]` |
| POST | /api/reviews | user | `{productId, rating(1-5), title?, body?}` | 201 review. Only if user has a DELIVERED order item for product (verified). Upsert (1 per user/product). Updates product ratingSum/ratingCount. Rate-limited. |

## Cart & wishlist (customer auth)
| Method | Path | Body | Response |
|---|---|---|---|---|
| GET | /api/cart | user | – | `CartPricingView` (server-computed; includes couponCode stored on cart, issues, groups) |
| POST | /api/cart/items | user | `{productId, variantId? (defaults to first active variant), sellerOfferId?, qty≤5}` | 201 `CartPricingView`. Validates ACTIVE product, stock. If sellerOffer given must belong to product & be active. Analytics `ADD_TO_CART`. |
| PATCH | /api/cart/items/[id] | user | `{qty (0 removes) }` | `CartPricingView`. 404 if item not in user's cart. |
| DELETE | /api/cart/items/[id] | user | – | `CartPricingView` |
| POST | /api/cart/coupon | user | `{code?}` (empty removes) | `CartPricingView` — validates & stores couponCode on cart (invalid → 422) |
| GET | /api/wishlist | user | – | `{items: WishlistItemView[]}` |
| POST | /api/wishlist/items | user | `{productId}` | 201 `{items}` (idempotent) |
| DELETE | /api/wishlist/items/[productId] | user | – | `{items}` |

## Addresses (customer auth)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | /api/addresses | – | `{items: AddressView[]}` (default first) |
| POST | /api/addresses | `{fullName, phone(10 digit), line1, line2?, landmark?, city, state, pincode(6), type, isDefault?}` | 201 `{item}`. If isDefault, unset others. First address auto-default. |
| PATCH | /api/addresses/[id] | partial same | `{item}` (ownership checked) |
| DELETE | /api/addresses/[id] | – | `{ok: true}` |

## Checkout & orders (customer auth)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | /api/checkout/validate | `{addressId?, couponCode?}` | `CheckoutValidateResponse` — pricing re-computed, issues reported, address list, codAllowed = all items codAvailable && total ≤ COD_MAX, codFee. Sweeps expired reservations. 422 `CART_EMPTY`; issues → still 200 with issues (frontend blocks). |
| POST | /api/orders | `{addressId, paymentMethod: UPI\|CARD\|NETBANKING\|WALLET\|COD, idempotencyKey (uuid), couponCode?}` | 201 `{order: OrderView, payment?: PaymentView}`. **Flow:** tx: recompute pricing (throw 409 if issues/out_of_stock) → reserve items (409) → create Order PENDING_PAYMENT (COD: CONFIRMED + ensureFulfillments) with full snapshots → coupon redemption record + usedCount++ (only when CONFIRMED) → payment: COD row (provider COD) or `createSandboxPayment` → clear cart + cart coupon → reserve TTL 20min → analytics ORDER_PLACED. Duplicate `idempotencyKey` returns the ORIGINAL order (200). Rate-limited. Audit `ORDER_PLACED`. |
| GET | /api/orders | user | `?page,pageSize,status` → paginated `{items: OrderView[]}` (desc) |
| GET | /api/orders/[id] | user (owner) or admin | `OrderView` (404 otherwise — no IDOR) |
| POST | /api/orders/[id]/cancel | owner | `{reason}` → `{order}` — only before shipped (else 409 `NOT_CANCELLABLE`) |
| GET | /api/orders/[id]/invoice-data | owner | simple JSON receipt snapshot (for UI print view) |

## Payments
| Method | Path | Body | Response |
|---|---|---|---|
| GET | /api/payments/[id]/status | owner | `{payment: PaymentView, order: {id, status, orderNumber}}` |
| POST | /api/payments/[id]/sandbox-pay | `{outcome: "success"\|"failure"}` owner | **SANDBOX ONLY.** Builds signed webhook payload via `buildWebhookPayload` and calls `processSandboxWebhook(raw, sig)` — the same verification path as real webhooks. Returns `{payment, order}`. 409 if payment not PENDING. Rate-limited. |
| POST | /api/webhooks/payments/sandbox | – (signature) | raw body + `x-sk-signature` header → `processSandboxWebhook`. Returns `{ok, code}`. Never errors loudly; 200 with ok:false on verify fail. |

## Returns & refunds (customer auth unless noted)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | /api/returns | user | `{items: ReturnRequestView[]}` own returns |
| POST | /api/returns | `{orderId, items:[{orderItemId, qty, reason}], type, description?}` | 201 `ReturnRequestView`. Validation: order owner, status DELIVERED, within returnDays of deliveredAt, item status ACTIVE, qty ≤ item qty. refundAmount = sum(unitPrice*qty). rmaNumber. OrderItem → RETURN_REQUESTED. Notify sellers. Audit. |
| GET | /api/returns/[id] | owner (or admin/seller via their routes) | `ReturnRequestView` |
| GET | /api/tracking/[trackingNumber] | owner/admin | `TrackingView` |

## Seller (role SELLER + sellerStatus APPROVED via `requireSeller()`)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | /api/seller/register | any authed customer: `{businessName, gstin?, supportEmail?, supportPhone?, pickupLine1, pickupCity, pickupState, pickupPincode, accountType, bankAccountName, bankAccountNumber, bankIfsc, documents?: [{type, number}]}` | 201 `{seller}` status PENDING. Sets user role SELLER. Creates SellerVerification. Audit. Rate-limited. |
| GET | /api/seller/dashboard | seller | `SellerDashboard` (real aggregates: 30d revenue from items, earnings = revenue - commission; chart by day; top products) |
| GET | /api/seller/products | seller | `?page,pageSize,status,q` → paginated `{items: SellerProduct[]}` own only |
| POST | /api/seller/products | seller | `{name, description, highlights[], specifications{}, categoryId, brandId?, images[{url}], variants[{sku, name, attributes, mrp, price, onHand}], warrantyMonths?, returnDays?, codAvailable?}` → 201 `SellerProduct` status PENDING (moderation). Creates Inventory rows. |
| GET | /api/seller/products/[id] | seller owner | `SellerProduct` |
| PATCH | /api/seller/products/[id] | seller owner | same fields optional; edits re-set status PENDING when content changes (price/name/desc/variants). Variant qty changes → adjustStock. |
| PATCH | /api/seller/inventory/[variantId] | seller owner | `{onHand}` → validate ≥ reserved, update. Returns `{onHand, availableQty}` |
| GET | /api/seller/orders | seller | `?page,status` → `{items: [{fulfillment: {id, status, itemsTotal, commissionAmount, sellerEarning, updatedAt}, order: {orderNumber, placedAt, paymentMethod, paymentStatus}, address, items: OrderItemView[]}]}` own only |
| PATCH | /api/seller/orders/[fulfillmentId] | seller owner | `{status: PROCESSING\|PACKED\|SHIPPED\|CANCELLED}` — validates flow via `canTransition`. SHIPPED → `createShipment` + notify customer. CANCELLED only before SHIPPED. Returns `{fulfillment}` |
| GET | /api/seller/returns | seller | `{items}` — returns containing own items |
| PATCH | /api/seller/returns/[id] | seller (own items) | `{action: "review"\|"approve"\|"reject"\|"schedule_pickup"\|"picked_up"\|"inspection"\|"close", note?}` — drives RETURN_STATUS_FLOW; refund itself initiated by admin. |
| GET | /api/seller/finance | seller | `{summary: {grossRevenue, totalCommission, netEarning, pendingPayout, deliveredOrders}, settlements: [{orderNumber, deliveredAt, itemsTotal, commission, earning}], monthly: [{month, revenue, earning}]}` (from DELIVERED fulfillments) |

## Admin (role ADMIN via `requireAdmin()`)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | /api/admin/dashboard | admin | `AdminDashboard` |
| GET | /api/admin/sellers | admin | `?status,q,page` → paginated `{items: SellerAdminRow[]}` |
| PATCH | /api/admin/sellers/[id] | admin | `{action: "approve"\|"reject"\|"suspend"\|"reactivate", note?, commissionBps?}` → audit + notify seller user. Reject/suspend also flips seller's ACTIVE products → ARCHIVED. |
| GET | /api/admin/products | admin | `?status,q,page` → paginated product rows (with seller, category, images) |
| PATCH | /api/admin/products/[id] | admin | `{action: "activate"\|"reject"\|"archive", note?}` → status change + moderationNote + audit + notify seller. activate requires ≥1 variant with price>0 & image. |
| GET | /api/admin/orders | admin | `?status,q,page` → paginated OrderView-ish rows |
| GET | /api/admin/payments | admin | `?status,page` → paginated payments w/ order numbers |
| GET | /api/admin/returns | admin | `?status,page` → all ReturnRequestView + userName |
| PATCH | /api/admin/returns/[id] | admin | `{action: "initiate_refund"\|"complete_refund"\|"close", note?}` → uses `createRefundForReturn` / `completeRefund` (idempotent, capped). Audit. |
| POST | /api/admin/shipments/[trackingNumber]/advance | admin | `{}` → `advanceShipment` (sandbox logistics progress). Audit `SHIPMENT_ADVANCED`. |
| GET | /api/admin/categories / brands / coupons | admin | `{items}` full lists |
| POST | /api/admin/categories | admin | `{name, slug?, parentId?, icon?}` |
| PATCH | /api/admin/categories/[id] | admin | `{name?, isActive?, sortOrder?}` |
| POST | /api/admin/brands | admin | `{name, slug?}` |
| POST | /api/admin/coupons | admin | `{code, description, type, value, minOrderValue?, maxDiscount?, usageLimit?, perUserLimit?, validFrom, validTo}` |
| PATCH | /api/admin/coupons/[id] | admin | `{isActive?}` |
| GET | /api/admin/users | admin | `?role,q,page` → users w/ counts; PATCH /api/admin/users/[id] `{action: "suspend"\|"activate"}` (cannot suspend self/admins; suspending seller also suspends seller) |
| GET | /api/admin/tickets | admin | `?status,page` → TicketView[] + user; PATCH /api/admin/tickets/[id] `{status?, reply?}` |
| GET | /api/admin/audit-logs | admin | `?action,page` → paginated logs |

## Support & misc
| Method | Path | Body | Response |
|---|---|---|---|
| GET | /api/notifications | user | `{items, unreadCount}` |
| POST | /api/notifications/read | user | `{ids?: string[]}` or all → `{ok}` |
| POST | /api/support/tickets | user | `{subject, category, message, orderId?}` → 201 TicketView |
| GET | /api/support/tickets | user | `{items: TicketView[]}` own |
| POST | /api/support/tickets/[id]/messages | owner or admin | `{body}` appends message; admin sets status IN_PROGRESS |
| POST | /api/analytics/event | any | `{type, payload?, sessionId?}` → 204. Allowed types whitelist: SEARCH, ADD_TO_CART, CHECKOUT_START, CHECKOUT_COMPLETE, ZERO_RESULT_SEARCH. |
| POST | /api/newsletter/subscribe | any | `{email}` → 201 `{subscribed:true, alreadySubscribed:false}` (new) / 200 `{subscribed:true, alreadySubscribed:true}` (idempotent duplicate; re-activates unsubscribed). Rate-limited 5/min per IP (429 RATE_LIMITED). Used by the footer "Stay in the Loop!" form. |
