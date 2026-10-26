// GET /api/admin/orders — all orders with user info and item counts.
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
    const q = sp.get("q");

    const where: Prisma.OrderWhereInput = {
      ...(status ? { status } : {}),
      ...(q ? { orderNumber: { contains: q } } : {}),
    };

    const [rows, total] = await Promise.all([
      db.order.findMany({
        where,
        include: { user: { select: { name: true, email: true } }, _count: { select: { items: true } } },
        orderBy: { placedAt: "desc" },
        skip: p.skip,
        take: p.take,
      }),
      db.order.count({ where }),
    ]);

    const items = rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      itemsTotal: o.itemsTotal,
      grandTotal: o.grandTotal,
      placedAt: o.placedAt.toISOString(),
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
      user: { name: o.user.name, email: o.user.email },
      itemCount: o._count.items,
    }));

    return ok(paginated(items, total, p));
  } catch (err) {
    return handleApiError(err);
  }
}
