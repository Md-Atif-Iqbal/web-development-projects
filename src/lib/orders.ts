// Order domain helpers: fulfillment creation, order status derivation,
// cancellation, notifications. Kept separate from route handlers so checkout,
// webhooks and admin flows share identical logic.

import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { ids } from "@/lib/ids";
import { parseJsonArray } from "@/lib/json";
import { SHIPPING_CONFIG } from "@/lib/constants";
import { shippingFeeForGroup } from "@/lib/pricing";
import { releaseReservations } from "@/lib/inventory";
import { markCodCollected } from "@/lib/payments/sandbox";
import { logAudit } from "@/lib/audit";

type Tx = Prisma.TransactionClient | PrismaClient;

export async function notify(
  tx: Tx,
  userId: string,
  type: string,
  title: string,
  body?: string
): Promise<void> {
  await tx.notification.create({ data: { userId, type, title, body: body ?? null } });
}

/**
 * Group an order's items by seller and create Fulfillment rows + attach items.
 * Safe to call multiple times (skips sellers that already have a fulfillment).
 */
export async function ensureFulfillmentsForOrder(tx: Tx, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { seller: true, product: true } } },
  });

  const groups = new Map<string, typeof order.items>();
  for (const item of order.items) {
    if (item.status === "CANCELLED") continue;
    const list = groups.get(item.sellerId) ?? [];
    list.push(item);
    groups.set(item.sellerId, list);
  }

  for (const [sellerId, items] of groups) {
    const existing = await tx.fulfillment.findFirst({ where: { orderId, sellerId } });
    if (existing) continue;

    const itemsTotal = items.reduce((s, i) => s + i.lineTotal, 0);
    const shippingFee = shippingFeeForGroup(itemsTotal);
    const commissionAmount = items.reduce(
      (s, i) => s + Math.floor((i.lineTotal * i.commissionBps) / 10000),
      0
    );
    const sellerEarning = itemsTotal - commissionAmount;

    const fulfillment = await tx.fulfillment.create({
      data: {
        orderId,
        sellerId,
        status: "CONFIRMED",
        itemsTotal,
        shippingFee,
        commissionAmount,
        sellerEarning,
        history: toJson([{ status: "CONFIRMED", at: new Date().toISOString(), note: "Order confirmed" }]),
      },
    });
    await tx.orderItem.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: { fulfillmentId: fulfillment.id },
    });
    await notify(tx, items[0].seller.userId, "ORDER", `New order ${order.orderNumber}`, `You have a new order to process.`);
  }
}

/** Derive order.status / paymentStatus from its fulfillments. Call after any fulfillment change. */
export async function syncOrderStatusFromFulfillments(tx: Tx, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const fulfillments = await tx.fulfillment.findMany({ where: { orderId } });
  if (fulfillments.length === 0) return;

  const statuses = fulfillments.map((f) => f.status);
  const allDelivered = statuses.every((s) => s === "DELIVERED");
  const allTerminalBad = statuses.every((s) => s === "CANCELLED");
  const anyOfd = statuses.includes("OUT_FOR_DELIVERY");
  const anyShipped = statuses.includes("SHIPPED") || anyOfd || statuses.includes("DELIVERED");
  const anyProcessing = statuses.some((s) => ["PROCESSING", "PACKED"].includes(s));

  let next: string | null = null;
  if (allDelivered) next = "DELIVERED";
  else if (allTerminalBad && order.status !== "CANCELLED") next = order.status; // partial cancellation keeps order visible
  else if (anyOfd) next = "OUT_FOR_DELIVERY";
  else if (anyShipped) next = "SHIPPED";
  else if (anyProcessing && ["CONFIRMED"].includes(order.status)) next = "PROCESSING";

  if (!next || next === order.status) return;

  const data: Prisma.OrderUpdateInput = { status: next };
  if (next === "DELIVERED") {
    data.deliveredAt = new Date();
    data.statusHistory = appendStatus(order.statusHistory, "DELIVERED", "All shipments delivered");
    // COD settlement: payment collected + reserved stock converted to sold
    if (order.paymentMethod === "COD") {
      await markCodCollected(orderId);
      const { convertReservations } = await import("@/lib/inventory");
      await convertReservations(tx, orderId);
    }
  } else {
    data.statusHistory = appendStatus(order.statusHistory, next);
  }
  await tx.order.update({ where: { id: orderId }, data });
}

export function appendStatus(rawHistory: string, status: string, note?: string): string {
  const history = parseJsonArray<{ status: string; at: string; note?: string }>(rawHistory);
  history.push({ status, at: new Date().toISOString(), ...(note ? { note } : {}) });
  return JSON.stringify(history);
}

/**
 * Cancel an order (customer/admin). Only allowed before any fulfillment has
 * shipped. Releases reservations, cancels payments + fulfillments atomically.
 */
export async function cancelOrder(
  orderId: string,
  actor: { id: string; role: string; email?: string },
  reason: string,
  restock = true
): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { fulfillments: true, payments: true } });
    if (!order) throw new Error("Order not found");
    if (["CANCELLED", "DELIVERED"].includes(order.status)) {
      throw new Error(`Order in status ${order.status} cannot be cancelled`);
    }
    const shipped = order.fulfillments.some((f) => ["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(f.status));
    if (shipped) throw new Error("Order already shipped — please request a return instead");

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason,
        statusHistory: appendStatus(order.statusHistory, "CANCELLED", reason),
      },
    });
    await tx.orderItem.updateMany({ where: { orderId, status: "ACTIVE" }, data: { status: "CANCELLED" } });
    await tx.fulfillment.updateMany({ where: { orderId }, data: { status: "CANCELLED", history: appendStatus("[]", "CANCELLED", reason) } });
    await tx.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "CANCELLED" } });

    // Restock converted items (order was paid -> stock already deducted)
    if (restock && ["CONFIRMED", "PROCESSING"].includes(order.status)) {
      const items = await tx.orderItem.findMany({ where: { orderId, status: "CANCELLED" } });
      for (const item of items) {
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "onHand" = "onHand" + ${item.qty}, "updatedAt" = ${new Date().toISOString()}
          WHERE "variantId" = ${item.variantId}`;
      }
    }
    // Release outstanding reservations (unpaid order)
    await releaseReservations(tx, { orderId });

    await notify(tx, order.userId, "ORDER", `Order ${order.orderNumber} cancelled`, reason);
  });

  await logAudit({ actorId: actor.id, actorRole: actor.role, actorEmail: actor.email, action: "ORDER_CANCELLED", entityType: "order", entityId: orderId, meta: { reason } });
}

/** Initiate a refund against the original payment (idempotent, capped). */
export async function createRefundForReturn(
  returnId: string,
  actor: { id: string; role: string; email?: string },
  opts?: { note?: string }
): Promise<{ id: string; amount: number; status: string }> {
  return db.$transaction(async (tx) => {
    const returnReq = await tx.returnRequest.findUnique({
      where: { id: returnId },
      include: { order: { include: { payments: true } }, items: true, refund: true },
    });
    if (!returnReq) throw new Error("Return request not found");
    if (returnReq.refund) throw new Error("Refund already exists for this request");
    if (!["INSPECTION_PENDING", "PICKED_UP", "APPROVED"].includes(returnReq.status)) {
      throw new Error(`Return in status ${returnReq.status} is not eligible for refund yet`);
    }

    // Maximum refundable = amount actually paid for the returned items (snapshot)
    const paidPayment = returnReq.order.payments.find((p) => p.status === "PAID");
    let maxRefundable = returnReq.refundAmount;
    if (paidPayment) {
      maxRefundable = Math.min(returnReq.refundAmount, paidPayment.amount);
    }
    if (maxRefundable <= 0) throw new Error("Refund amount must be positive");

    const refund = await tx.refund.create({
      data: {
        returnId,
        orderId: returnReq.orderId,
        paymentId: paidPayment?.id ?? null,
        amount: maxRefundable,
        status: "INITIATED",
        mode: returnReq.refundMode,
        providerRef: ids.refundRef(),
        note: opts?.note ?? null,
      },
    });
    await tx.returnRequest.update({
      where: { id: returnId },
      data: { status: "REFUND_INITIATED", updatedAt: new Date() },
    });
    await notify(tx, returnReq.userId, "RETURN", "Refund initiated", `₹${(maxRefundable / 100).toFixed(2)} refund initiated for ${returnReq.rmaNumber}`);
    return { id: refund.id, amount: refund.amount, status: refund.status };
  }).then(async (result) => {
    // Audit AFTER the transaction commits — logAudit uses the root PrismaClient,
    // and SQLite allows only one writer, so calling it inside the interactive
    // transaction deadlocks on the write lock (tx timeout after 5s).
    await logAudit({ actorId: actor.id, actorRole: actor.role, actorEmail: actor.email, action: "REFUND_INITIATED", entityType: "return", entityId: returnId, meta: { amount: result.amount } });
    return result;
  });
}

/** Complete a refund (sandbox: instant; real provider: after gateway confirms). */
export async function completeRefund(
  refundId: string,
  actor: { id: string; role: string; email?: string }
): Promise<void> {
  await db.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({ where: { id: refundId }, include: { returnReq: true, order: true } });
    if (!refund) throw new Error("Refund not found");
    if (refund.status === "COMPLETED") return; // idempotent
    if (refund.status === "FAILED") throw new Error("Failed refund must be re-initiated");

    await tx.refund.update({ where: { id: refundId }, data: { status: "COMPLETED", completedAt: new Date() } });
    if (refund.returnId && refund.returnReq) {
      await tx.returnRequest.update({
        where: { id: refund.returnId },
        data: { status: "REFUND_COMPLETED", updatedAt: new Date() },
      });
      await notify(tx, refund.order.userId, "RETURN", "Refund completed", `₹${(refund.amount / 100).toFixed(2)} refunded to original payment method`);
    }
    // Update order payment status
    const order = await tx.order.findUnique({
      where: { id: refund.orderId },
      include: { refunds: true, payments: true },
    });
    if (order) {
      const totalPaid = order.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
      const totalRefunded = order.refunds.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r.amount, 0);
      const paymentStatus = totalRefunded === 0 ? "PAID" : totalRefunded >= totalPaid ? "REFUNDED" : "PARTIALLY_REFUNDED";
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus } });
      if (refund.paymentId) {
        await tx.payment.update({
          where: { id: refund.paymentId },
          data: { status: totalRefunded >= totalPaid ? "REFUNDED" : "PARTIALLY_REFUNDED" },
        });
      }
    }
  });
  await logAudit({ actorId: actor.id, actorRole: actor.role, actorEmail: actor.email, action: "REFUND_COMPLETED", entityType: "refund", entityId: refundId });
}

export { SHIPPING_CONFIG, ids };
