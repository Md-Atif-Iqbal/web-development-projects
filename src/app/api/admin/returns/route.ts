// GET /api/admin/returns — every return request with user info.
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, getPagination, paginated } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import type { ReturnRequestView } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const p = getPagination(sp, 20);
    const status = sp.get("status")?.toUpperCase();

    const where: Prisma.ReturnRequestWhereInput = status ? { status } : {};

    const [rows, total] = await Promise.all([
      db.returnRequest.findMany({
        where,
        include: {
          order: { select: { orderNumber: true } },
          user: { select: { name: true } },
          items: { include: { orderItem: { select: { name: true, imageUrl: true } } } },
          refund: true,
        },
        orderBy: { updatedAt: "desc" },
        skip: p.skip,
        take: p.take,
      }),
      db.returnRequest.count({ where }),
    ]);

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
      items: r.items.map((ri) => ({
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

    return ok(paginated(items, total, p));
  } catch (err) {
    return handleApiError(err);
  }
}
