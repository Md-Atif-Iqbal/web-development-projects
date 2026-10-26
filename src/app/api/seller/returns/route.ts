// GET /api/seller/returns — return requests that contain this seller's order items.
// Items are filtered to the seller's own items only.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/http";
import { requireSeller } from "@/lib/auth";
import type { ReturnRequestView } from "@/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const session = await requireSeller();
    const sellerId = session.sellerId;

    const rows = await db.returnRequest.findMany({
      where: { items: { some: { orderItem: { sellerId } } } },
      include: {
        order: { select: { orderNumber: true } },
        user: { select: { name: true } },
        items: { include: { orderItem: { select: { sellerId: true, name: true, imageUrl: true } } } },
        refund: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const items = rows.map<ReturnRequestView & { userName: string }>((r) => ({
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
      userName: r.user.name,
      items: r.items
        .filter((ri) => ri.orderItem.sellerId === sellerId)
        .map((ri) => ({
          id: ri.id,
          orderItemId: ri.orderItemId,
          productName: ri.orderItem.name,
          image: ri.orderItem.imageUrl,
          qty: ri.qty,
          reason: ri.reason,
        })),
      refund: r.refund
        ? { id: r.refund.id, amount: r.refund.amount, status: r.refund.status, mode: r.refund.mode }
        : null,
    }));

    return ok({ items });
  } catch (err) {
    return handleApiError(err);
  }
}
