// POST /api/cart/items {productId, variantId, sellerOfferId?, qty} — add to
// cart. Validates: product ACTIVE, variant belongs to product & active,
// optional offer belongs to product & active & seller APPROVED, qty 1..5.
// Upserts on (cartId, variantId): existing line increments qty, capped at 5.
// Blocks adding beyond available stock. Logs ADD_TO_CART analytics.

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, handleApiError, parseBody } from "@/lib/http";
import { db } from "@/lib/db";
import { requireUser, getSessionUser } from "@/lib/auth";
import { ApiHttpError } from "@/lib/http";
import { computeCartPricing } from "@/lib/pricing";
import { toJson } from "@/lib/json";

const MAX_QTY = 5;

const addItemSchema = z.object({
  productId: z.string().min(1),
  // Optional: when omitted (quick "Add to Cart" from product cards), the
  // product's first active variant is used as the default selection.
  variantId: z.string().min(1).optional(),
  sellerOfferId: z.string().min(1).optional(),
  qty: z.number().int().min(1, "Quantity must be at least 1").max(MAX_QTY, `Maximum ${MAX_QTY} units per item`).default(1),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseBody(req, addItemSchema);

    const product = await db.product.findUnique({
      where: { id: body.productId },
      select: { id: true, status: true },
    });
    if (!product || product.status !== "ACTIVE") {
      return fail(404, "NOT_FOUND", "Product not found or no longer available");
    }

    // Resolve the requested variant, or default to the product's first
    // active variant for quick-add flows that send only productId.
    const variant = body.variantId
      ? await db.productVariant.findUnique({
          where: { id: body.variantId },
          include: { inventory: true },
        })
      : await db.productVariant.findFirst({
          where: { productId: product.id, isActive: true },
          orderBy: { sku: "asc" },
          include: { inventory: true },
        });
    if (!variant || variant.productId !== product.id) {
      throw new ApiHttpError(422, "INVALID_VARIANT", "This variant does not belong to the selected product");
    }
    if (!variant.isActive) {
      throw new ApiHttpError(409, "UNAVAILABLE", "This variant is no longer available");
    }

    // Optional seller offer: must belong to this product, be active, and the
    // seller must be APPROVED.
    let offerId: string | null = null;
    if (body.sellerOfferId) {
      const offer = await db.sellerOffer.findUnique({
        where: { id: body.sellerOfferId },
        include: { seller: { select: { status: true } } },
      });
      if (!offer || offer.productId !== product.id || !offer.isActive || offer.seller.status !== "APPROVED") {
        throw new ApiHttpError(422, "INVALID_OFFER", "This seller offer is not available");
      }
      offerId = offer.id;
    }

    const availableQty = Math.max(0, (variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0));

    const cart = await db.cart.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    const existing = await db.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
    });

    const finalQty = existing ? Math.min(existing.qty + body.qty, MAX_QTY) : body.qty;
    if (availableQty < finalQty) {
      throw new ApiHttpError(
        409,
        "OUT_OF_STOCK",
        availableQty === 0
          ? "This item is out of stock"
          : `Only ${availableQty} left in stock for this item`
      );
    }

    if (existing) {
      await db.cartItem.update({ where: { id: existing.id }, data: { qty: finalQty, sellerOfferId: offerId } });
    } else {
      await db.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          variantId: variant.id,
          sellerOfferId: offerId,
          qty: finalQty,
        },
      });
    }

    // Analytics: ADD_TO_CART (non-blocking).
    const session = await getSessionUser().catch(() => null);
    db.analyticsEvent
      .create({
        data: {
          userId: session?.id ?? user.id,
          type: "ADD_TO_CART",
          payload: toJson({ productId: product.id, variantId: variant.id, qty: finalQty }),
        },
      })
      .catch(() => undefined);

    const pricing = await computeCartPricing(user.id);
    return ok(pricing, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
