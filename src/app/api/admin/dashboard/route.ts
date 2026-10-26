// GET /api/admin/dashboard — marketplace-wide aggregates.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();

    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * DAY_MS);
    const d14 = new Date(now.getTime() - 14 * DAY_MS);
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalCustomers,
      totalSellers,
      pendingSellers,
      totalProducts,
      pendingProducts,
      totalOrders,
      ordersToday,
      pendingReturns,
      openTickets,
      revenue30Agg,
      commission30Agg,
      orders14d,
      statusGroups,
      itemAgg,
    ] = await Promise.all([
      db.user.count({ where: { role: "CUSTOMER" } }),
      db.seller.count(),
      db.seller.count({ where: { status: "PENDING" } }),
      db.product.count(),
      db.product.count({ where: { status: "PENDING" } }),
      db.order.count(),
      db.order.count({ where: { placedAt: { gte: startToday } } }),
      db.returnRequest.count({
        where: {
          status: {
            in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PICKUP_SCHEDULED", "PICKED_UP", "INSPECTION_PENDING"],
          },
        },
      }),
      db.supportTicket.count({ where: { status: "OPEN" } }),
      db.order.aggregate({
        _sum: { grandTotal: true },
        where: { placedAt: { gte: d30 }, status: { not: "CANCELLED" } },
      }),
      db.fulfillment.aggregate({
        _sum: { commissionAmount: true },
        where: { createdAt: { gte: d30 }, status: { not: "CANCELLED" } },
      }),
      db.order.findMany({
        where: { placedAt: { gte: d14 } },
        select: { grandTotal: true, placedAt: true, status: true },
      }),
      db.order.groupBy({ by: ["status"], _count: { _all: true } }),
      db.orderItem.groupBy({
        by: ["productId"],
        _sum: { qty: true, lineTotal: true },
        where: { status: { not: "CANCELLED" } },
      }),
    ]);

    // 14-day revenue chart by orders.placedAt (revenue excludes cancelled orders).
    const revenueChart = Array.from({ length: 14 }, (_, idx) => {
      const date = dayKey(new Date(now.getTime() - (13 - idx) * DAY_MS));
      const dayRows = orders14d.filter((o) => dayKey(o.placedAt) === date && o.status !== "CANCELLED");
      return {
        date,
        revenue: dayRows.reduce((s, o) => s + o.grandTotal, 0),
        orders: dayRows.length,
      };
    });

    const orderStatusBreakdown = statusGroups
      .map((g) => ({ status: g.status, count: g._count._all }))
      .sort((a, b) => b.count - a.count);

    // Top categories by units sold (orderItem → product → category).
    const products = await db.product.findMany({
      where: { id: { in: itemAgg.map((r) => r.productId) } },
      select: { id: true, category: { select: { name: true } } },
    });
    const catNameById = new Map(products.map((p) => [p.id, p.category.name]));
    const catMap = new Map<string, { name: string; unitsSold: number; revenue: number }>();
    for (const row of itemAgg) {
      const name = catNameById.get(row.productId) ?? "Other";
      const cur = catMap.get(name) ?? { name, unitsSold: 0, revenue: 0 };
      cur.unitsSold += row._sum.qty ?? 0;
      cur.revenue += row._sum.lineTotal ?? 0;
      catMap.set(name, cur);
    }
    const topCategories = [...catMap.values()].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 5);

    return ok({
      stats: {
        totalCustomers,
        totalSellers,
        pendingSellers,
        totalProducts,
        pendingProducts,
        totalOrders,
        ordersToday,
        revenue30d: revenue30Agg._sum.grandTotal ?? 0,
        commission30d: commission30Agg._sum.commissionAmount ?? 0,
        pendingReturns,
        openTickets,
      },
      revenueChart,
      orderStatusBreakdown,
      topCategories,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
