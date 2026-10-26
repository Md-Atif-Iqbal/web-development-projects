// GET /api/orders/[id]/invoice-data — simple receipt snapshot (owner or admin)
// for the UI print view: dates, seller-wise line items, totals, address.
import { NextRequest } from "next/server";
import { ok, handleApiError, ApiHttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseJsonArray, parseJsonObject } from "@/lib/json";
import { shippingFeeForGroup } from "@/lib/pricing";
import { ROLES } from "@/lib/constants";
import type { AddressView, PaymentView } from "@/lib/types";

export const dynamic = "force-dynamic";

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const order = await db.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            seller: { select: { businessName: true } },
            fulfillment: { select: { shippingFee: true } },
          },
        },
        payments: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) throw new ApiHttpError(404, "NOT_FOUND", "Order not found");
    if (order.userId !== user.id && user.role !== ROLES.ADMIN) {
      throw new ApiHttpError(404, "NOT_FOUND", "Order not found");
    }

    // Group line items by seller.
    const groups = new Map<
      string,
      {
        sellerId: string;
        sellerName: string;
        items: {
          id: string;
          name: string;
          sku: string;
          variantName: string | null;
          qty: number;
          unitPrice: number;
          listPrice: number;
          lineTotal: number;
          status: string;
        }[];
        itemsTotal: number;
        shippingFee: number;
      }
    >();
    for (const item of order.items) {
      let g = groups.get(item.sellerId);
      if (!g) {
        g = { sellerId: item.sellerId, sellerName: item.seller?.businessName ?? "", items: [], itemsTotal: 0, shippingFee: 0 };
        groups.set(item.sellerId, g);
      }
      g.items.push({
        id: item.id,
        name: item.name,
        sku: item.sku,
        variantName: item.variantName,
        qty: item.qty,
        unitPrice: item.unitPrice,
        listPrice: item.listPrice,
        lineTotal: item.lineTotal,
        status: item.status,
      });
      g.itemsTotal += item.lineTotal;
    }
    const sellerSections = [...groups.values()].map((g) => {
      const shippingFee = order.items.find((i) => i.sellerId === g.sellerId)?.fulfillment?.shippingFee ?? shippingFeeForGroup(g.itemsTotal);
      g.shippingFee = shippingFee;
      return { ...g, sectionTotal: g.itemsTotal + shippingFee };
    });

    const payments: PaymentView[] = order.payments.map((p) => ({
      id: p.id,
      provider: p.provider,
      method: p.method,
      amount: p.amount,
      status: p.status,
      providerRef: p.providerRef,
      sandbox: p.sandbox,
      failureReason: p.failureReason,
      createdAt: p.createdAt.toISOString(),
    }));

    return ok({
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      placedAt: order.placedAt.toISOString(),
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      billedTo: parseJsonObject<AddressView>(order.addressSnapshot, EMPTY_ADDRESS),
      sellerSections,
      itemsTotal: order.itemsTotal,
      discountTotal: order.discountTotal,
      couponCode: order.couponCode,
      couponDiscount: order.couponDiscount,
      shippingTotal: order.shippingTotal,
      grandTotal: order.grandTotal,
      statusHistory: parseJsonArray<{ status: string; at: string; note?: string }>(order.statusHistory),
      payments,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
