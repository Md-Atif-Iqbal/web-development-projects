// POST /api/orders/[id]/cancel — customer cancels their own order before it ships.
import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { cancelOrder } from "@/lib/orders";
import { rateLimit, RATE } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { parseJsonArray, parseJsonObject } from "@/lib/json";
import type { AddressView, OrderView, OrderItemView, PaymentView } from "@/lib/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional().default("No reason provided"),
});

// Serialization duplicated from ../route.ts (route files are self-contained).
const orderInclude = {
  items: {
    include: {
      seller: { select: { businessName: true } },
      fulfillment: { include: { shipment: { select: { trackingNumber: true } } } },
    },
  },
  payments: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const EMPTY_ADDRESS: AddressView = {
  id: "",
  fullName: "",
  phone: "",
  line1: "",
  line2: null,
  landmark: null,
  city: "",
  state: "",
  pincode: "",
  type: "HOME",
  isDefault: false,
};

function toPaymentView(p: OrderRow["payments"][number]): PaymentView {
  return {
    id: p.id,
    provider: p.provider,
    method: p.method,
    amount: p.amount,
    status: p.status,
    providerRef: p.providerRef,
    sandbox: p.sandbox,
    failureReason: p.failureReason,
    createdAt: p.createdAt.toISOString(),
  };
}

function toOrderItemView(item: OrderRow["items"][number]): OrderItemView {
  return {
    id: item.id,
    productId: item.productId,
    name: item.name,
    sku: item.sku,
    image: item.imageUrl,
    variantName: item.variantName,
    unitPrice: item.unitPrice,
    listPrice: item.listPrice,
    qty: item.qty,
    lineTotal: item.lineTotal,
    status: item.status,
    returnDays: item.returnDays,
    sellerId: item.sellerId,
    sellerName: item.seller?.businessName ?? "",
    fulfillmentId: item.fulfillmentId,
    fulfillmentStatus: item.fulfillment?.status ?? null,
    trackingNumber: item.fulfillment?.shipment?.trackingNumber ?? null,
  };
}

function toOrderView(order: OrderRow): OrderView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    itemsTotal: order.itemsTotal,
    discountTotal: order.discountTotal,
    couponCode: order.couponCode,
    couponDiscount: order.couponDiscount,
    shippingTotal: order.shippingTotal,
    grandTotal: order.grandTotal,
    placedAt: order.placedAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelReason: order.cancelReason,
    address: parseJsonObject<AddressView>(order.addressSnapshot, EMPTY_ADDRESS),
    statusHistory: parseJsonArray<{ status: string; at: string; note?: string }>(order.statusHistory),
    items: order.items.map(toOrderItemView),
    payments: order.payments.map(toPaymentView),
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const rl = rateLimit(`cancel:${user.id}`, RATE.genericWrite.limit, RATE.genericWrite.windowMs);
    if (!rl.allowed) {
      throw new ApiHttpError(429, "RATE_LIMITED", `Too many attempts. Try again in ${rl.retryAfterSec}s.`);
    }

    const body = await parseBody(req, bodySchema);

    const order = await db.order.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!order || order.userId !== user.id) {
      throw new ApiHttpError(404, "NOT_FOUND", "Order not found");
    }

    try {
      await cancelOrder(id, { id: user.id, role: user.role, email: user.email }, body.reason);
    } catch (err) {
      if (err instanceof ApiHttpError) throw err;
      // Domain rule violations from cancelOrder arrive as plain Errors.
      throw new ApiHttpError(409, "NOT_CANCELLABLE", err instanceof Error ? err.message : "Order cannot be cancelled");
    }

    const fresh = await db.order.findUnique({ where: { id }, include: orderInclude });
    if (!fresh) throw new ApiHttpError(404, "NOT_FOUND", "Order not found");
    return ok({ order: toOrderView(fresh) });
  } catch (err) {
    return handleApiError(err);
  }
}
