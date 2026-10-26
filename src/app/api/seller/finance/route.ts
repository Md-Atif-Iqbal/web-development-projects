// GET /api/seller/finance — payouts summary, recent settlements and monthly trend.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/http";
import { requireSeller } from "@/lib/auth";

export async function GET(_req: NextRequest) {
  try {
    const session = await requireSeller();
    const sellerId = session.sellerId;

    const fulfillments = await db.fulfillment.findMany({
      where: { sellerId, status: { not: "CANCELLED" } },
      include: { order: { select: { orderNumber: true, deliveredAt: true } } },
      orderBy: { updatedAt: "desc" },
    });

    const delivered = fulfillments.filter((f) => f.status === "DELIVERED");

    const grossRevenue = fulfillments.reduce((s, f) => s + f.itemsTotal, 0);
    const totalCommission = fulfillments.reduce((s, f) => s + f.commissionAmount, 0);
    const netEarning = grossRevenue - totalCommission;
    const pendingPayout = fulfillments
      .filter((f) => f.status !== "DELIVERED")
      .reduce((s, f) => s + f.sellerEarning, 0);

    const settlements = [...delivered]
      .sort(
        (a, b) =>
          (b.order.deliveredAt?.getTime() ?? 0) - (a.order.deliveredAt?.getTime() ?? 0)
      )
      .slice(0, 50)
      .map((f) => ({
        orderNumber: f.order.orderNumber,
        deliveredAt: (f.order.deliveredAt ?? f.updatedAt).toISOString(),
        itemsTotal: f.itemsTotal,
        commission: f.commissionAmount,
        earning: f.sellerEarning,
      }));

    // Monthly trend for the last 6 months (including current month).
    const now = new Date();
    const buckets = new Map<string, { revenue: number; earning: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, {
        revenue: 0,
        earning: 0,
      });
    }
    for (const f of fulfillments) {
      const key = `${f.createdAt.getFullYear()}-${String(f.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.revenue += f.itemsTotal;
        bucket.earning += f.sellerEarning;
      }
    }

    return ok({
      summary: {
        grossRevenue,
        totalCommission,
        netEarning,
        pendingPayout,
        deliveredOrders: delivered.length,
      },
      settlements,
      monthly: [...buckets.entries()].map(([month, v]) => ({ month, ...v })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
