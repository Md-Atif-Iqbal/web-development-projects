// GET /api/returns/[id] — one return request (owner or admin; sellers have
// their own routes). 404 for anyone else (no IDOR).
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { ok, handleApiError, ApiHttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/constants";
import type { ReturnRequestView } from "@/lib/types";

export const dynamic = "force-dynamic";

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const rr = await db.returnRequest.findUnique({ where: { id }, include: returnInclude });
    if (!rr) throw new ApiHttpError(404, "NOT_FOUND", "Return request not found");
    if (rr.userId !== user.id && user.role !== ROLES.ADMIN) {
      throw new ApiHttpError(404, "NOT_FOUND", "Return request not found");
    }

    return ok(toReturnView(rr));
  } catch (err) {
    return handleApiError(err);
  }
}
