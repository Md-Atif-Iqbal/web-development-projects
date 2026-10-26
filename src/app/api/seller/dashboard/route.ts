// GET /api/seller/dashboard — real aggregates for the seller console.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError, ApiHttpError } from "@/lib/http";
import { requireSeller } from "@/lib/auth";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(_req: NextRequest) {
  try {
    const session = await requireSeller();
    const sellerId = session.sellerId;

    const seller = await db.seller.findUnique({ where: { id: sellerId } });
    if (!seller) throw new ApiHttpError(404, "SELLER_NOT_FOUND", "Seller account not found");

    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * DAY_MS);
    const d14 = new Date(now.getTime() - 14 * DAY_MS);

    const [
      totalProducts,
      activeProducts,
      pendingProducts,
      ordersToProcess,
      inventories,
      items30d,
      fulfillments14d,
      pendingReturns,
    ] = await Promise.all([
      db.product.count({ where: { sellerId } }),
      db.product.count({ where: { sellerId, status: "ACTIVE" } }),
      db.product.count({ where: { sellerId, status: "PENDING" } }),
      db.fulfillment.count({ where: { sellerId, status: { in: ["CONFIRMED", "PROCESSING"] } } }),
      db.inventory.findMany({
        where: { variant: { product: { sellerId } } },
        select: { onHand: true, reserved: true, lowStockThreshold: true },
      }),
      db.orderItem.findMany({
        where: {
          sellerId,
          status: { not: "CANCELLED" },
          order: { placedAt: { gte: d30 }, status: { not: "CANCELLED" } },
        },
        select: {
          lineTotal: true,
          commissionBps: true,
          qty: true,
          productId: true,
          name: true,
          order: { select: { placedAt: true } },
        },
      }),
      db.fulfillment.findMany({
        where: { sellerId, createdAt: { gte: d14 } },
        select: { createdAt: true },
      }),
      db.returnRequest.count({
        where: {
          status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PICKUP_SCHEDULED"] },
          items: { some: { orderItem: { sellerId } } },
        },
      }),
    ]);

    const revenue30d = items30d.reduce((s, i) => s + i.lineTotal, 0);
    const commission30d = items30d.reduce((s, i) => s + Math.floor((i.lineTotal * i.commissionBps) / 10000), 0);

    const lowStockCount = inventories.filter((inv) => {
      const available = inv.onHand - inv.reserved;
      return available > 0 && available <= inv.lowStockThreshold;
    }).length;

    // Revenue chart — last 14 days (revenue by order placedAt, orders = own fulfillments created that day).
    const items14d = items30d.filter((i) => i.order.placedAt >= d14);
    const revenueChart = Array.from({ length: 14 }, (_, idx) => {
      const date = dayKey(new Date(now.getTime() - (13 - idx) * DAY_MS));
      const revenue = items14d
        .filter((i) => dayKey(i.order.placedAt) === date)
        .reduce((s, i) => s + i.lineTotal, 0);
      const orders = fulfillments14d.filter((f) => dayKey(f.createdAt) === date).length;
      return { date, revenue, orders };
    });

    // Top products by units sold over the last 30 days.
    const byProduct = new Map<string, { name: string; unitsSold: number; revenue: number }>();
    for (const it of items30d) {
      const cur = byProduct.get(it.productId) ?? { name: it.name, unitsSold: 0, revenue: 0 };
      cur.unitsSold += it.qty;
      cur.revenue += it.lineTotal;
      byProduct.set(it.productId, cur);
    }
    const topProducts = [...byProduct.entries()]
      .sort((a, b) => b[1].unitsSold - a[1].unitsSold)
      .slice(0, 5)
      .map(([productId, v]) => ({ productId, name: v.name, unitsSold: v.unitsSold, revenue: v.revenue }));

    const rating = seller.ratingCount > 0 ? Math.round((seller.ratingSum / seller.ratingCount) * 10) / 10 : null;

    return ok({
      seller: {
        id: seller.id,
        businessName: seller.businessName,
        status: seller.status,
        commissionBps: seller.commissionBps,
        rating,
      },
      stats: {
        totalProducts,
        activeProducts,
        pendingProducts,
        lowStockCount,
        ordersToProcess,
        revenue30d,
        earnings30d: revenue30d - commission30d,
        pendingReturns,
      },
      revenueChart,
      topProducts,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
