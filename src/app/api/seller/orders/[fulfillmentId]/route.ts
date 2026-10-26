// PATCH /api/seller/orders/[fulfillmentId] — seller fulfills an order:
// PROCESSING / PACKED / SHIPPED (creates sandbox shipment) / CANCELLED (restocks).
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireSeller } from "@/lib/auth";
import { canTransition, FULFILLMENT_STATUS_FLOW } from "@/lib/constants";
import { notify, appendStatus, syncOrderStatusFromFulfillments } from "@/lib/orders";
import { createShipment } from "@/lib/logistics/mock";
import { parseJsonArray } from "@/lib/json";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  status: z.enum(["PROCESSING", "PACKED", "SHIPPED", "CANCELLED"]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ fulfillmentId: string }> }) {
  try {
    const session = await requireSeller();
    const { fulfillmentId } = await params;
    const body = await parseBody(req, bodySchema);

    const fulfillment = await db.fulfillment.findUnique({
      where: { id: fulfillmentId },
      include: { order: true, items: true },
    });
    // Data isolation: only the owning seller may act on a fulfillment.
    if (!fulfillment || fulfillment.sellerId !== session.sellerId) {
      throw new ApiHttpError(404, "NOT_FOUND", "Fulfillment not found");
    }

    const next = body.status;
    const allowed =
      canTransition(FULFILLMENT_STATUS_FLOW, fulfillment.status, next) ||
      // Sellers may cancel a fulfillment any time before dispatch.
      (next === "CANCELLED" && ["CONFIRMED", "PROCESSING", "PACKED"].includes(fulfillment.status));
    if (!allowed) {
      throw new ApiHttpError(
        409,
        "INVALID_STATUS_TRANSITION",
        `Cannot move fulfillment from ${fulfillment.status} to ${next}`
      );
    }

    let trackingNumber: string | null = null;

    await db.$transaction(async (tx) => {
      if (next === "SHIPPED") {
        const shipment = await createShipment(tx, fulfillment.id);
        trackingNumber = shipment.trackingNumber;
        await notify(
          tx,
          fulfillment.order.userId,
          "ORDER",
          `Order ${fulfillment.order.orderNumber} shipped`,
          `Your package is on its way. Tracking: ${trackingNumber}`
        );
      }

      await tx.fulfillment.update({
        where: { id: fulfillment.id },
        data: { status: next, history: appendStatus(fulfillment.history, next) },
      });

      if (next === "CANCELLED") {
        // Cancel the still-active items and restock their inventory.
        const cancellable = fulfillment.items.filter((i) => i.status === "ACTIVE");
        await tx.orderItem.updateMany({
          where: { id: { in: cancellable.map((i) => i.id) } },
          data: { status: "CANCELLED" },
        });
        for (const item of cancellable) {
          await tx.$executeRaw`
            UPDATE "Inventory"
            SET "onHand" = "onHand" + ${item.qty}, "updatedAt" = ${new Date().toISOString()}
            WHERE "variantId" = ${item.variantId}`;
        }
      }

      await syncOrderStatusFromFulfillments(tx, fulfillment.orderId);
    });

    await logAudit({
      actorId: session.id,
      actorRole: session.role,
      actorEmail: session.email,
      action: next === "CANCELLED" ? "FULFILLMENT_CANCELLED" : "FULFILLMENT_STATUS_UPDATED",
      entityType: "fulfillment",
      entityId: fulfillment.id,
      meta: { from: fulfillment.status, to: next, orderNumber: fulfillment.order.orderNumber },
    });

    const updated = await db.fulfillment.findUnique({ where: { id: fulfillment.id } });
    return ok({
      fulfillment: updated
        ? {
            id: updated.id,
            orderId: updated.orderId,
            status: updated.status,
            itemsTotal: updated.itemsTotal,
            commissionAmount: updated.commissionAmount,
            sellerEarning: updated.sellerEarning,
            trackingNumber,
            history: parseJsonArray<{ status: string; at: string; note?: string }>(updated.history),
            createdAt: updated.createdAt.toISOString(),
            updatedAt: updated.updatedAt.toISOString(),
          }
        : null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
