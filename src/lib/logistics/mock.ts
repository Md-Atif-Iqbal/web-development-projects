// Mock logistics adapter — clearly labelled "MOCK_LOGISTICS" provider.
//
// Implements the interface a real courier integration (Delhivery/Shiprocket
// etc.) would: create shipment with tracking id, advance tracking events.
// No fabricated real-time data is ever shown to customers: every tracking
// event is produced by explicit actions (seller dispatch / admin sandbox
// advance) and the UI labels the provider as sandbox logistics.

import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { toJson, parseJsonArray } from "@/lib/json";
import { ids } from "@/lib/ids";
import { SHIPPING_CONFIG } from "@/lib/constants";
import { syncOrderStatusFromFulfillments } from "@/lib/orders";
import { notify } from "@/lib/orders";

type Tx = Prisma.TransactionClient | PrismaClient;

export const SHIPMENT_CHAIN = [
  "LABEL_CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_CHAIN)[number] | "DELIVERY_FAILED";

const STATUS_NOTES: Record<string, string> = {
  LABEL_CREATED: "Shipping label created",
  PICKED_UP: "Package picked up by courier",
  IN_TRANSIT: "In transit to destination hub",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  DELIVERY_FAILED: "Delivery attempt failed — will retry",
};

/** Create a shipment record when the seller dispatches a fulfillment. */
export async function createShipment(
  tx: Tx,
  fulfillmentId: string,
  opts?: { pincode?: string; estimatedDays?: number }
): Promise<{ trackingNumber: string; estimatedDelivery: Date }> {
  const existing = await tx.shipment.findUnique({ where: { fulfillmentId } });
  if (existing) {
    return { trackingNumber: existing.trackingNumber, estimatedDelivery: existing.estimatedDelivery ?? new Date() };
  }
  const days = opts?.estimatedDays ?? SHIPPING_CONFIG.DEFAULT_DELIVERY_DAYS;
  const estimatedDelivery = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const trackingNumber = ids.trackingNumber();
  await tx.shipment.create({
    data: {
      fulfillmentId,
      provider: "MOCK_LOGISTICS",
      trackingNumber,
      status: "LABEL_CREATED",
      events: toJson([{ status: "LABEL_CREATED", at: new Date().toISOString(), note: STATUS_NOTES.LABEL_CREATED }]),
      estimatedDelivery,
    },
  });
  return { trackingNumber, estimatedDelivery };
}

/**
 * Advance a shipment one step forward (sandbox simulation action).
 * Returns the new status. Syncs fulfillment + order status, marks COD paid.
 */
export async function advanceShipment(trackingNumber: string): Promise<{ status: string }> {
  return db.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({
      where: { trackingNumber },
      include: { fulfillment: { include: { order: true } } },
    });
    if (!shipment) throw new Error("Shipment not found");
    if (shipment.status === "DELIVERED" || shipment.status === "DELIVERY_FAILED") {
      return { status: shipment.status };
    }
    const idx = SHIPMENT_CHAIN.indexOf(shipment.status as (typeof SHIPMENT_CHAIN)[number]);
    const next = SHIPMENT_CHAIN[Math.min(idx + 1, SHIPMENT_CHAIN.length - 1)];
    const events = parseJsonArray(shipment.events);
    events.push({ status: next, at: new Date().toISOString(), note: STATUS_NOTES[next] });

    await tx.shipment.update({
      where: { id: shipment.id },
      data: { status: next, events: JSON.stringify(events), deliveredAt: next === "DELIVERED" ? new Date() : null },
    });

    const fulfillmentStatus =
      next === "PICKED_UP" || next === "IN_TRANSIT" ? "SHIPPED" : next === "OUT_FOR_DELIVERY" ? "OUT_FOR_DELIVERY" : next === "DELIVERED" ? "DELIVERED" : "SHIPPED";
    await tx.fulfillment.update({
      where: { id: shipment.fulfillmentId },
      data: { status: fulfillmentStatus, history: JSON.stringify([...parseJsonArray(shipment.fulfillment.history), { status: fulfillmentStatus, at: new Date().toISOString(), note: `Logistics: ${STATUS_NOTES[next]}` }]) },
    });
    await syncOrderStatusFromFulfillments(tx, shipment.fulfillment.orderId);
    return { status: next };
  });
}

/** Get public tracking view for a tracking number (customer-safe fields). */
export async function getTracking(trackingNumber: string) {
  const shipment = await db.shipment.findUnique({
    where: { trackingNumber },
    include: {
      fulfillment: {
        include: { order: { select: { orderNumber: true, userId: true } }, seller: { select: { businessName: true } } },
      },
    },
  });
  if (!shipment) return null;
  return {
    trackingNumber: shipment.trackingNumber,
    provider: shipment.provider,
    status: shipment.status,
    estimatedDelivery: shipment.estimatedDelivery,
    deliveredAt: shipment.deliveredAt,
    events: parseJsonArray<{ status: string; at: string; note?: string }>(shipment.events),
    orderNumber: shipment.fulfillment.order.orderNumber,
    sellerName: shipment.fulfillment.seller.businessName,
  };
}
