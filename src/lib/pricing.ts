// Server-side pricing engine — THE single source of truth for money.
// Used by cart rendering AND checkout. Never trust client-computed totals.

import { db } from "@/lib/db";
import { ApiHttpError } from "@/lib/http";
import { parseJsonObject, parseJsonArray } from "@/lib/json";
import { SHIPPING_CONFIG } from "@/lib/constants";
import { sweepExpiredReservations } from "@/lib/inventory";

export type PricedCartIssue = {
  cartItemId: string;
  type: "OUT_OF_STOCK" | "QTY_LIMIT" | "UNAVAILABLE" | "PRICE_CHANGED";
  message: string;
  availableQty?: number;
  currentUnitPrice?: number;
};

export type PricedCartItem = {
  cartItemId: string;
  productId: string;
  variantId: string;
  sellerOfferId: string | null;
  sellerId: string;
  sellerName: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  image: string | null;
  qty: number;
  maxQty: number;
  unitPrice: number; // paise, resolved from seller offer or variant
  listPrice: number; // paise (MRP)
  lineTotal: number;
  inStock: boolean;
  availableQty: number;
  codAvailable: boolean;
  returnDays: number;
};

export type FulfillmentGroup = {
  sellerId: string;
  sellerName: string;
  itemsTotal: number;
  shippingFee: number;
  cartItemIds: string[];
};

export type CartPricing = {
  items: PricedCartItem[];
  issues: PricedCartIssue[];
  itemsTotal: number;
  listTotal: number;
  savingsTotal: number;
  couponDiscount: number;
  couponCode: string | null;
  couponMessage: string | null;
  shippingTotal: number;
  grandTotal: number;
  fulfillmentGroups: FulfillmentGroup[];
};

const MAX_QTY_PER_LINE = 5;

export function couponDiscountFor(
  coupon: { type: string; value: number; maxDiscount: number | null },
  base: number
): number {
  if (base <= 0) return 0;
  const raw =
    coupon.type === "PERCENT" ? Math.floor((base * coupon.value) / 100) : Math.min(coupon.value, base);
  const capped = coupon.type === "PERCENT" && coupon.maxDiscount ? Math.min(raw, coupon.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, base));
}

export function shippingFeeForGroup(itemsTotal: number): number {
  return itemsTotal >= SHIPPING_CONFIG.FREE_THRESHOLD_PAISE ? 0 : SHIPPING_CONFIG.STANDARD_FEE_PAISE;
}

/**
 * Validates a coupon server-side. Returns discount paise or throws 422.
 */
export async function validateCoupon(
  code: string,
  userId: string,
  itemsTotal: number
): Promise<{ id: string; code: string; description: string; discount: number }> {
  const coupon = await db.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.isActive) throw new ApiHttpError(422, "COUPON_INVALID", "This coupon code is not valid");
  const now = new Date();
  if (coupon.validFrom > now || coupon.validTo < now)
    throw new ApiHttpError(422, "COUPON_EXPIRED", "This coupon has expired");
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit)
    throw new ApiHttpError(422, "COUPON_EXHAUSTED", "This coupon has been fully redeemed");
  if (itemsTotal < coupon.minOrderValue)
    throw new ApiHttpError(
      422,
      "COUPON_MIN_ORDER",
      `Add items worth ₹${((coupon.minOrderValue - itemsTotal) / 100).toFixed(0)} more to use this coupon`
    );
  const usedByUser = await db.couponRedemption.count({ where: { couponId: coupon.id, userId } });
  if (usedByUser >= coupon.perUserLimit)
    throw new ApiHttpError(422, "COUPON_USER_LIMIT", "You have already used this coupon");

  // Discount applies to itemsTotal (pre-shipping). CouponDiscountFor caps at base.
  const discount = couponDiscountFor(coupon, itemsTotal);
  return { id: coupon.id, code: coupon.code, description: coupon.description, discount };
}

/**
 * Compute authoritative pricing for a user's cart.
 * Applies coupon (validated) and shipping rules; reports item issues.
 */
export async function computeCartPricing(
  userId: string,
  opts: { couponCode?: string | null; sweepReservations?: boolean } = {}
): Promise<CartPricing> {
  if (opts.sweepReservations !== false) await sweepExpiredReservations();

  const cart = await db.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: { include: { category: true, images: { orderBy: { sortOrder: "asc" } }, seller: true } },
          variant: { include: { inventory: true } },
          offer: { include: { seller: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const items: PricedCartItem[] = [];
  const issues: PricedCartIssue[] = [];

  for (const item of cart?.items ?? []) {
    const product = item.product;
    const variant = item.variant;
    const offer = item.offer;

    // Availability rules
    const productAvailable = product.status === "ACTIVE";
    const variantActive = variant.isActive;
    const sellerOk =
      (!offer || (offer.isActive && offer.seller.status === "APPROVED")) &&
      (offer ? true : product.seller.status === "APPROVED");
    const sellingSellerId = offer ? offer.sellerId : product.sellerId;
    const sellingSellerName = offer ? offer.seller.businessName : product.seller.businessName;
    const availableQty = Math.max(0, (variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0));

    if (!productAvailable || !variantActive || !sellerOk) {
      issues.push({
        cartItemId: item.id,
        type: "UNAVAILABLE",
        message: `"${product.name}" is no longer available`,
      });
      continue;
    }

    // Price resolution — seller offer wins, otherwise the listing variant price
    const unitPrice = offer && offer.isActive ? offer.price : variant.price;
    const listPrice = offer?.mrp ?? variant.mrp;
    if (unitPrice !== variant.price) {
      // offer price differs from variant list — informational only
    }

    const qty = Math.min(item.qty, MAX_QTY_PER_LINE);
    if (qty !== item.qty) {
      issues.push({
        cartItemId: item.id,
        type: "QTY_LIMIT",
        message: `Maximum ${MAX_QTY_PER_LINE} units per item`,
      });
    }
    const inStock = availableQty >= qty;
    if (!inStock) {
      issues.push({
        cartItemId: item.id,
        type: "OUT_OF_STOCK",
        message:
          availableQty === 0
            ? `"${product.name}" is out of stock`
            : `Only ${availableQty} left in stock for "${product.name}"`,
        availableQty,
      });
    }

    items.push({
      cartItemId: item.id,
      productId: product.id,
      variantId: variant.id,
      sellerOfferId: offer && offer.isActive ? offer.id : null,
      sellerId: sellingSellerId,
      sellerName: sellingSellerName,
      productName: product.name,
      productSlug: product.slug,
      variantName: variant.name,
      sku: variant.sku,
      image: product.images[0]?.url ?? null,
      qty,
      maxQty: MAX_QTY_PER_LINE,
      unitPrice,
      listPrice,
      lineTotal: unitPrice * qty,
      inStock,
      availableQty,
      codAvailable: product.codAvailable,
      returnDays: product.returnDays,
    });
  }

  const itemsTotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const listTotal = items.reduce((s, i) => s + i.listPrice * i.qty, 0);
  const savingsTotal = Math.max(0, listTotal - itemsTotal);

  // Fulfillment groups (per seller)
  const groupMap = new Map<string, FulfillmentGroup>();
  for (const item of items) {
    let group = groupMap.get(item.sellerId);
    if (!group) {
      group = { sellerId: item.sellerId, sellerName: item.sellerName, itemsTotal: 0, shippingFee: 0, cartItemIds: [] };
      groupMap.set(item.sellerId, group);
    }
    group.itemsTotal += item.lineTotal;
    group.cartItemIds.push(item.cartItemId);
  }
  for (const group of groupMap.values()) {
    group.shippingFee = shippingFeeForGroup(group.itemsTotal);
  }
  const fulfillmentGroups = [...groupMap.values()];
  const shippingTotal = fulfillmentGroups.reduce((s, g) => s + g.shippingFee, 0);

  // Coupon
  let couponDiscount = 0;
  let couponCode: string | null = null;
  let couponMessage: string | null = null;
  const requestedCode = opts.couponCode ?? cart?.couponCode ?? null;
  if (requestedCode) {
    if (issues.length > 0) {
      couponMessage = "Resolve cart issues before applying the coupon";
    } else {
      try {
        const coupon = await validateCoupon(requestedCode, userId, itemsTotal);
        couponDiscount = coupon.discount;
        couponCode = coupon.code;
        couponMessage = `${coupon.code} applied — you saved`;
      } catch (err) {
        couponMessage = err instanceof ApiHttpError ? err.message : "Coupon could not be applied";
      }
    }
  }

  const grandTotal = Math.max(0, itemsTotal - couponDiscount + shippingTotal);

  return {
    items,
    issues,
    itemsTotal,
    listTotal,
    savingsTotal,
    couponDiscount,
    couponCode,
    couponMessage,
    shippingTotal,
    grandTotal,
    fulfillmentGroups,
  };
}

/** Resolve the priced image/attribute snapshots used for order items. */
export function variantAttributesOf(variant: { attributes: string }): Record<string, string> {
  return parseJsonObject<Record<string, string>>(variant.attributes, {});
}

export { parseJsonArray };
