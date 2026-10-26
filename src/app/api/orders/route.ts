// GET  /api/orders — paginated list of the signed-in user's orders (desc).
// POST /api/orders — place an order from the cart (THE critical checkout flow):
// idempotency -> pricing -> atomic tx (reserve + order + items + snapshots) ->
// payment (COD inline / sandbox after tx) -> clear cart -> analytics/audit.
import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ok, handleApiError, parseBody, getPagination, paginated, ApiHttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { computeCartPricing } from "@/lib/pricing";
import { reserveItems, releaseReservations } from "@/lib/inventory";
import { ensureFulfillmentsForOrder, appendStatus, notify } from "@/lib/orders";
import { createSandboxPayment } from "@/lib/payments/sandbox";
import { rateLimit, RATE } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { ids } from "@/lib/ids";
import { db } from "@/lib/db";
import { parseJsonArray, parseJsonObject, toJson } from "@/lib/json";
import { PAYMENT_METHODS, SHIPPING_CONFIG, PAGE_SIZES } from "@/lib/constants";
import type { AddressView, OrderView, OrderItemView, PaymentView } from "@/lib/types";

export const dynamic = "force-dynamic";

// ── Serialization (contract shape from src/lib/types.ts) ────────────────────

const orderInclude = {
  items: {
    include: {
      seller: { select: { businessName: true } },
      fulfillment: { include: { shipment: { select: { trackingNumber: true } } } },
    },
  },
  payments: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const EMPTY_ADDRESS: AddressView = {
  id: "",
  fullName: "",
  phone: "",
  line1: "",
  line2: null,
  landmark: null,
  city: "",
  state: "",
  pincode: "",
  type: "HOME",
  isDefault: false,
};

function toPaymentView(p: OrderRow["payments"][number]): PaymentView {
  return {
    id: p.id,
    provider: p.provider,
    method: p.method,
    amount: p.amount,
    status: p.status,
    providerRef: p.providerRef,
    sandbox: p.sandbox,
    failureReason: p.failureReason,
    createdAt: p.createdAt.toISOString(),
  };
}

function toOrderItemView(item: OrderRow["items"][number]): OrderItemView {
  return {
    id: item.id,
    productId: item.productId,
    name: item.name,
    sku: item.sku,
    image: item.imageUrl,
    variantName: item.variantName,
    unitPrice: item.unitPrice,
    listPrice: item.listPrice,
    qty: item.qty,
    lineTotal: item.lineTotal,
    status: item.status,
    returnDays: item.returnDays,
    sellerId: item.sellerId,
    sellerName: item.seller?.businessName ?? "",
    fulfillmentId: item.fulfillmentId,
    fulfillmentStatus: item.fulfillment?.status ?? null,
    trackingNumber: item.fulfillment?.shipment?.trackingNumber ?? null,
  };
}

function toOrderView(order: OrderRow): OrderView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    itemsTotal: order.itemsTotal,
    discountTotal: order.discountTotal,
    couponCode: order.couponCode,
    couponDiscount: order.couponDiscount,
    shippingTotal: order.shippingTotal,
    grandTotal: order.grandTotal,
    placedAt: order.placedAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelReason: order.cancelReason,
    address: parseJsonObject<AddressView>(order.addressSnapshot, EMPTY_ADDRESS),
    statusHistory: parseJsonArray<{ status: string; at: string; note?: string }>(order.statusHistory),
    items: order.items.map(toOrderItemView),
    payments: order.payments.map(toPaymentView),
  };
}

async function loadOrderView(orderId: string): Promise<OrderView> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) throw new ApiHttpError(404, "NOT_FOUND", "Order not found");
  return toOrderView(order);
}

// ── GET /api/orders ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const p = getPagination(sp, PAGE_SIZES.orders, 50);
    const status = sp.get("status") || undefined;

    const where: Prisma.OrderWhereInput = {
      userId: user.id,
      ...(status ? { status } : {}),
    };

    const [rows, total] = await Promise.all([
      db.order.findMany({ where, include: orderInclude, orderBy: { placedAt: "desc" }, skip: p.skip, take: p.take }),
      db.order.count({ where }),
    ]);

    return ok(paginated(rows.map(toOrderView), total, p));
  } catch (err) {
    return handleApiError(err);
  }
}

// ── POST /api/orders ────────────────────────────────────────────────────────

const createSchema = z.object({
  addressId: z.string().min(1),
  paymentMethod: z.enum(PAYMENT_METHODS),
  idempotencyKey: z.string().min(8).max(64),
  couponCode: z.string().trim().min(1).max(40).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const rl = rateLimit(`checkout:${user.id}`, RATE.checkout.limit, RATE.checkout.windowMs);
    if (!rl.allowed) {
      throw new ApiHttpError(429, "RATE_LIMITED", `Too many checkout attempts. Try again in ${rl.retryAfterSec}s.`);
    }

    const body = await parseBody(req, createSchema);
    const isCod = body.paymentMethod === "COD";

    // 1. Idempotency — same key from the same user returns the original order.
    const existing = await db.order.findUnique({
      where: { idempotencyKey: body.idempotencyKey },
      include: orderInclude,
    });
    if (existing) {
      if (existing.userId !== user.id) {
        throw new ApiHttpError(409, "IDEMPOTENCY_CONFLICT", "This idempotency key is already in use");
      }
      return ok({ order: toOrderView(existing), payment: existing.payments[0] ? toPaymentView(existing.payments[0]) : null }, 200);
    }

    // 2. Address must belong to the user.
    const address = await db.address.findFirst({ where: { id: body.addressId, userId: user.id } });
    if (!address) throw new ApiHttpError(404, "NOT_FOUND", "Delivery address not found");
    const addressView: AddressView = {
      id: address.id,
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      type: address.type,
      isDefault: address.isDefault,
    };

    // 3. Authoritative pricing (also sweeps expired reservations).
    const pricing = await computeCartPricing(user.id, { couponCode: body.couponCode ?? undefined });
    if (pricing.items.length === 0) {
      throw new ApiHttpError(422, "CART_EMPTY", "Your cart is empty");
    }
    if (pricing.issues.length > 0) {
      throw new ApiHttpError(409, "CART_ISSUES", "Your cart needs attention before placing the order", pricing.issues);
    }

    // An explicitly passed coupon that failed to apply is a hard error.
    const requestedCoupon = body.couponCode?.trim().toUpperCase();
    if (requestedCoupon && pricing.couponCode !== requestedCoupon) {
      throw new ApiHttpError(422, "COUPON_INVALID", pricing.couponMessage ?? "Coupon could not be applied");
    }

    // 4. COD validation.
    const codAllowed =
      pricing.items.every((i) => i.codAvailable) && pricing.grandTotal <= SHIPPING_CONFIG.COD_MAX_ORDER_PAISE;
    if (isCod && !codAllowed) {
      throw new ApiHttpError(422, "COD_NOT_ALLOWED", "Cash on delivery is not available for this order");
    }

    // Resolve the coupon row (already validated inside computeCartPricing).
    const coupon = pricing.couponCode
      ? await db.coupon.findUnique({ where: { code: pricing.couponCode } })
      : null;

    // Sellers' commission snapshots.
    const sellerIds = [...new Set(pricing.items.map((i) => i.sellerId))];
    const sellers = await db.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, commissionBps: true } });
    const commissionBySeller = new Map(sellers.map((s) => [s.id, s.commissionBps]));

    // 5. The one atomic transaction: reservations + order + items (+ COD extras).
    let order: Awaited<ReturnType<typeof loadOrderView>>;
    let paymentView: PaymentView | null = null;

    try {
      const createdId = await db.$transaction(async (tx) => {
        const now = new Date();
        const history = toJson([{ status: "PENDING_PAYMENT", at: now.toISOString(), note: "Order placed" }]);

        const orderRow = await tx.order.create({
          data: {
            orderNumber: ids.orderNumber(),
            userId: user.id,
            status: isCod ? "CONFIRMED" : "PENDING_PAYMENT",
            paymentMethod: body.paymentMethod,
            paymentStatus: "PENDING",
            itemsTotal: pricing.itemsTotal,
            discountTotal: pricing.couponDiscount,
            couponCode: pricing.couponCode,
            couponDiscount: pricing.couponDiscount,
            shippingTotal: pricing.shippingTotal,
            grandTotal: pricing.grandTotal,
            addressSnapshot: toJson(addressView),
            statusHistory: isCod
              ? appendStatus(history, "CONFIRMED", "Cash on delivery — order confirmed")
              : history,
            idempotencyKey: body.idempotencyKey,
            couponId: coupon?.id ?? null,
            placedAt: now,
            confirmedAt: isCod ? now : null,
          },
        });

        for (const item of pricing.items) {
          await tx.orderItem.create({
            data: {
              orderId: orderRow.id,
              productId: item.productId,
              variantId: item.variantId,
              sellerId: item.sellerId,
              offerId: item.sellerOfferId,
              name: item.productName,
              sku: item.sku,
              imageUrl: item.image,
              variantName: item.variantName,
              unitPrice: item.unitPrice,
              listPrice: item.listPrice,
              qty: item.qty,
              lineTotal: item.lineTotal,
              commissionBps: commissionBySeller.get(item.sellerId) ?? 1000,
              status: "ACTIVE",
              returnDays: item.returnDays,
            },
          });
        }

        // Reserve stock atomically (throws 409 OUT_OF_STOCK on race — rolls back the order).
        await reserveItems(
          tx,
          user.id,
          pricing.items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
          orderRow.id
        );

        if (isCod) {
          await tx.payment.create({
            data: {
              orderId: orderRow.id,
              provider: "COD",
              method: "COD",
              amount: pricing.grandTotal,
              status: "PENDING",
              sandbox: true,
            },
          });
          // Coupon redemption happens only when the order becomes CONFIRMED.
          if (coupon) {
            await tx.couponRedemption.create({
              data: {
                couponId: coupon.id,
                userId: user.id,
                orderId: orderRow.id,
                discountAmount: pricing.couponDiscount,
              },
            });
            await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
          }
          await ensureFulfillmentsForOrder(tx, orderRow.id);
          await notify(tx, user.id, "ORDER", `Order ${orderRow.orderNumber} confirmed`, "Pay in cash when your order is delivered.");
        }

        // 6. Clear the cart.
        await tx.cartItem.deleteMany({ where: { cart: { userId: user.id } } });
        await tx.cart.updateMany({ where: { userId: user.id }, data: { couponCode: null } });

        return orderRow.id;
      });

      order = await loadOrderView(createdId);
    } catch (err) {
      // Concurrent duplicate idempotency key → return the winner's order.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await db.order.findUnique({ where: { idempotencyKey: body.idempotencyKey }, include: orderInclude });
        if (winner && winner.userId === user.id) {
          return ok({ order: toOrderView(winner), payment: winner.payments[0] ? toPaymentView(winner.payments[0]) : null }, 200);
        }
      }
      throw err;
    }

    // 7. Prepaid: create the sandbox payment AFTER the tx (it does its own writes).
    if (!isCod) {
      try {
        const payment = await createSandboxPayment(order.id, body.paymentMethod, pricing.grandTotal);
        paymentView = toPaymentView(payment);
      } catch (err) {
        // Payment initialisation failed — undo the reservation so the customer can retry.
        await db
          .$transaction(async (tx) => {
            const row = await tx.order.findUnique({ where: { id: order.id } });
            if (!row || row.status !== "PENDING_PAYMENT") return;
            await tx.order.update({
              where: { id: order.id },
              data: {
                status: "CANCELLED",
                cancelledAt: new Date(),
                cancelReason: "Payment initialisation failed",
                statusHistory: appendStatus(row.statusHistory, "CANCELLED", "Payment initialisation failed"),
              },
            });
            await tx.orderItem.updateMany({ where: { orderId: order.id, status: "ACTIVE" }, data: { status: "CANCELLED" } });
            await releaseReservations(tx, { orderId: order.id });
          })
          .catch(() => undefined);
        throw new ApiHttpError(502, "PAYMENT_INIT_FAILED", "Could not start the payment. Please retry checkout.");
      }
    } else {
      // COD: the payment row was created in the tx and is already serialized on the view.
      paymentView = order.payments[0] ?? null;
    }

    // 8. Analytics + audit.
    await db.analyticsEvent
      .create({
        data: {
          type: "ORDER_PLACED",
          userId: user.id,
          payload: toJson({
            orderId: order.id,
            orderNumber: order.orderNumber,
            grandTotal: order.grandTotal,
            paymentMethod: body.paymentMethod,
          }),
        },
      })
      .catch(() => undefined);
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      actorEmail: user.email,
      action: "ORDER_PLACED",
      entityType: "order",
      entityId: order.id,
      meta: { orderNumber: order.orderNumber, grandTotal: order.grandTotal, paymentMethod: body.paymentMethod },
    });

    // 9. Done.
    return ok({ order, payment: paymentView }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
