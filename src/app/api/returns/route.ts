// GET  /api/returns — the user's return requests (desc) with items + refund.
// POST /api/returns — create a return/exchange request for a DELIVERED order.
import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/orders";
import { logAudit } from "@/lib/audit";
import { ids } from "@/lib/ids";
import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { RETURN_REASONS } from "@/lib/constants";
import type { ReturnRequestView } from "@/lib/types";

export const dynamic = "force-dynamic";

// ── Serialization ───────────────────────────────────────────────────────────

const returnInclude = {
  items: {
    include: { product: { include: { images: { orderBy: { sortOrder: "asc" as const }, take: 1 } } } },
  },
  refund: true,
  order: { select: { orderNumber: true } },
} satisfies Prisma.ReturnRequestInclude;

type ReturnRow = Prisma.ReturnRequestGetPayload<{ include: typeof returnInclude }>;

function toReturnView(r: ReturnRow): ReturnRequestView {
  return {
    id: r.id,
    rmaNumber: r.rmaNumber,
    orderId: r.orderId,
    orderNumber: r.order.orderNumber,
    type: r.type,
    status: r.status,
    reason: r.reason,
    description: r.description,
    refundAmount: r.refundAmount,
    refundMode: r.refundMode,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    items: r.items.map((ri) => ({
      id: ri.id,
      orderItemId: ri.orderItemId,
      productName: ri.product.name,
      image: ri.product.images[0]?.url ?? null,
      qty: ri.qty,
      reason: ri.reason,
    })),
    refund: r.refund
      ? { id: r.refund.id, amount: r.refund.amount, status: r.refund.status, mode: r.refund.mode }
      : null,
  };
}

// ── GET /api/returns ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db.returnRequest.findMany({
      where: { userId: user.id },
      include: returnInclude,
      orderBy: { createdAt: "desc" },
    });
    return ok({ items: rows.map(toReturnView) });
  } catch (err) {
    return handleApiError(err);
  }
}

// ── POST /api/returns ───────────────────────────────────────────────────────

const createSchema = z.object({
  orderId: z.string().min(1),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        qty: z.number().int().min(1),
        reason: z.enum(RETURN_REASONS),
      })
    )
    .min(1),
  type: z.enum(["RETURN", "EXCHANGE"]),
  description: z.string().trim().min(1).max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseBody(req, createSchema);

    const order = await db.order.findUnique({ where: { id: body.orderId }, include: { items: true } });
    if (!order || order.userId !== user.id) {
      throw new ApiHttpError(404, "NOT_FOUND", "Order not found");
    }
    if (order.status !== "DELIVERED" || !order.deliveredAt) {
      throw new ApiHttpError(409, "ORDER_NOT_DELIVERED", "Returns can be requested only after the order is delivered");
    }

    const itemsById = new Map(order.items.map((i) => [i.id, i]));
    const requestedIds = new Set(body.items.map((l) => l.orderItemId));
    if (requestedIds.size !== body.items.length) {
      throw new ApiHttpError(422, "INVALID_RETURN_ITEMS", "Duplicate order items in the request");
    }

    // Per-item validation.
    const problems: { orderItemId: string; message: string }[] = [];
    for (const line of body.items) {
      const oi = itemsById.get(line.orderItemId);
      if (!oi) {
        problems.push({ orderItemId: line.orderItemId, message: "Item does not belong to this order" });
        continue;
      }
      if (oi.status !== "ACTIVE") {
        problems.push({ orderItemId: oi.id, message: `Item is not eligible for return (status ${oi.status})` });
        continue;
      }
      const windowEndMs = order.deliveredAt.getTime() + oi.returnDays * 24 * 60 * 60 * 1000;
      if (Date.now() > windowEndMs) {
        problems.push({ orderItemId: oi.id, message: `Return window of ${oi.returnDays} days has expired` });
        continue;
      }
      if (line.qty > oi.qty) {
        problems.push({ orderItemId: oi.id, message: `Quantity exceeds the purchased quantity (${oi.qty})` });
      }
    }

    // Already-returned quantities across previous requests.
    if (problems.length === 0) {
      const prior = await db.returnItem.groupBy({
        by: ["orderItemId"],
        where: { orderItemId: { in: body.items.map((l) => l.orderItemId) } },
        _sum: { qty: true },
      });
      const priorQty = new Map(prior.map((p) => [p.orderItemId, p._sum.qty ?? 0]));
      for (const line of body.items) {
        const oi = itemsById.get(line.orderItemId);
        if (!oi) continue;
        const already = priorQty.get(oi.id) ?? 0;
        if (already + line.qty > oi.qty) {
          problems.push({ orderItemId: oi.id, message: `Only ${Math.max(0, oi.qty - already)} more unit(s) can be returned` });
        }
      }
    }

    if (problems.length > 0) {
      throw new ApiHttpError(422, "INVALID_RETURN_ITEMS", "Some items cannot be returned", problems);
    }

    // Refund amount = Σ unitPrice * qty, capped at what the order cost.
    let refundAmount = 0;
    for (const line of body.items) {
      const oi = itemsById.get(line.orderItemId);
      if (oi) refundAmount += oi.unitPrice * line.qty;
    }
    refundAmount = Math.min(refundAmount, order.grandTotal);

    const refundMode = order.paymentMethod === "COD" ? "BANK_TRANSFER" : "ORIGINAL";
    const rmaNumber = ids.rmaNumber();

    const created = await db.$transaction(async (tx) => {
      const rr = await tx.returnRequest.create({
        data: {
          rmaNumber,
          orderId: order.id,
          userId: user.id,
          type: body.type,
          status: "REQUESTED",
          reason: body.items[0].reason,
          description: body.description ?? null,
          refundAmount,
          refundMode,
        },
      });
      for (const line of body.items) {
        const oi = itemsById.get(line.orderItemId);
        if (!oi) continue;
        await tx.returnItem.create({
          data: { returnId: rr.id, orderItemId: oi.id, productId: oi.productId, qty: line.qty, reason: line.reason },
        });
      }
      await tx.orderItem.updateMany({
        where: { id: { in: body.items.map((l) => l.orderItemId) } },
        data: { status: "RETURN_REQUESTED" },
      });

      // Notify each affected seller.
      const sellerIds = [...new Set(body.items.map((l) => itemsById.get(l.orderItemId)?.sellerId).filter((s): s is string => !!s))];
      const sellers = await tx.seller.findMany({ where: { id: { in: sellerIds } }, select: { userId: true, businessName: true } });
      for (const s of sellers) {
        await notify(tx, s.userId, "RETURN", `Return requested — ${rmaNumber}`, `A ${body.type.toLowerCase()} was requested for order ${order.orderNumber}.`);
      }
      return rr;
    });

    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      actorEmail: user.email,
      action: "RETURN_REQUESTED",
      entityType: "return",
      entityId: created.id,
      meta: { rmaNumber, orderId: order.id, orderNumber: order.orderNumber, refundAmount },
    });
    await db.analyticsEvent
      .create({
        data: {
          type: "RETURN_REQUESTED",
          userId: user.id,
          payload: toJson({ returnId: created.id, orderId: order.id, rmaNumber, itemCount: body.items.length }),
        },
      })
      .catch(() => undefined);

    const view = await db.returnRequest.findUnique({ where: { id: created.id }, include: returnInclude });
    if (!view) throw new ApiHttpError(500, "INTERNAL_ERROR", "Return request could not be loaded");
    return ok(toReturnView(view), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
