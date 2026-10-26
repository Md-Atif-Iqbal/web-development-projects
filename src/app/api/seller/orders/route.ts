// GET /api/seller/orders — own fulfillments with order, address and items (desc by updatedAt).
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, getPagination, paginated } from "@/lib/http";
import { requireSeller } from "@/lib/auth";
import { parseJsonObject } from "@/lib/json";
import type { AddressView, OrderItemView } from "@/lib/types";

const fulfillmentInclude = {
  order: true,
  items: true,
  shipment: { select: { trackingNumber: true } },
} satisfies Prisma.FulfillmentInclude;

export async function GET(req: NextRequest) {
  try {
    const session = await requireSeller();
    const sellerId = session.sellerId;
    const sp = req.nextUrl.searchParams;
    const p = getPagination(sp, 10);
    const status = sp.get("status")?.toUpperCase();

    const where: Prisma.FulfillmentWhereInput = {
      sellerId,
      ...(status ? { status } : {}),
    };

    const [seller, rows, total] = await Promise.all([
      db.seller.findUnique({ where: { id: sellerId }, select: { businessName: true } }),
      db.fulfillment.findMany({
        where,
        include: fulfillmentInclude,
        orderBy: { updatedAt: "desc" },
        skip: p.skip,
        take: p.take,
      }),
      db.fulfillment.count({ where }),
    ]);

    const sellerName = seller?.businessName ?? "";

    const items = rows.map((f) => ({
      fulfillment: {
        id: f.id,
        status: f.status,
        itemsTotal: f.itemsTotal,
        shippingFee: f.shippingFee,
        commissionAmount: f.commissionAmount,
        sellerEarning: f.sellerEarning,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
        trackingNumber: f.shipment?.trackingNumber ?? null,
      },
      order: {
        id: f.order.id,
        orderNumber: f.order.orderNumber,
        status: f.order.status,
        placedAt: f.order.placedAt.toISOString(),
        paymentMethod: f.order.paymentMethod,
        paymentStatus: f.order.paymentStatus,
      },
      address: parseJsonObject<Partial<AddressView>>(f.order.addressSnapshot, {}),
      items: f.items.map<OrderItemView>((it) => ({
        id: it.id,
        productId: it.productId,
        name: it.name,
        sku: it.sku,
        image: it.imageUrl,
        variantName: it.variantName,
        unitPrice: it.unitPrice,
        listPrice: it.listPrice,
        qty: it.qty,
        lineTotal: it.lineTotal,
        status: it.status,
        returnDays: it.returnDays,
        sellerId: it.sellerId,
        sellerName,
        fulfillmentId: f.id,
        fulfillmentStatus: f.status,
        trackingNumber: f.shipment?.trackingNumber ?? null,
      })),
    }));

    return ok(paginated(items, total, p));
  } catch (err) {
    return handleApiError(err);
  }
}
