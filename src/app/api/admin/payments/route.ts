// GET /api/admin/payments — payment ledger with order numbers (sandbox flagged).
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, getPagination, paginated } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const p = getPagination(sp, 20);
    const status = sp.get("status")?.toUpperCase();

    const where: Prisma.PaymentWhereInput = status ? { status } : {};

    const [rows, total] = await Promise.all([
      db.payment.findMany({
        where,
        include: { order: { select: { orderNumber: true, userId: true } } },
        orderBy: { createdAt: "desc" },
        skip: p.skip,
        take: p.take,
      }),
      db.payment.count({ where }),
    ]);

    const items = rows.map((pay) => ({
      id: pay.id,
      orderId: pay.orderId,
      orderNumber: pay.order.orderNumber,
      provider: pay.provider,
      method: pay.method,
      amount: pay.amount,
      status: pay.status,
      providerRef: pay.providerRef,
      sandbox: pay.sandbox,
      failureReason: pay.failureReason,
      createdAt: pay.createdAt.toISOString(),
    }));

    return ok(paginated(items, total, p));
  } catch (err) {
    return handleApiError(err);
  }
}
