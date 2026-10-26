// PATCH /api/cart/items/[id] {qty} — update line quantity (0 removes the line,
// 1..5 valid range). DELETE — remove the line. The item must belong to the
// caller's cart, otherwise 404 (no IDOR). Both return the fresh CartPricingView.

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, handleApiError, parseBody } from "@/lib/http";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { computeCartPricing } from "@/lib/pricing";

const patchSchema = z.object({
  qty: z
    .number()
    .int()
    .min(0, "Quantity cannot be negative")
    .max(5, "Maximum 5 units per item"),
});

async function loadOwnedItem(cartItemId: string, userId: string) {
  const item = await db.cartItem.findUnique({
    where: { id: cartItemId },
    include: { cart: { select: { userId: true } } },
  });
  if (!item || item.cart.userId !== userId) return null;
  return item;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseBody(req, patchSchema);

    const item = await loadOwnedItem(id, user.id);
    if (!item) return fail(404, "NOT_FOUND", "Cart item not found");

    if (body.qty === 0) {
      await db.cartItem.delete({ where: { id: item.id } });
    } else {
      await db.cartItem.update({ where: { id: item.id }, data: { qty: body.qty } });
    }

    const pricing = await computeCartPricing(user.id);
    return ok(pricing);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const item = await loadOwnedItem(id, user.id);
    if (!item) return fail(404, "NOT_FOUND", "Cart item not found");

    await db.cartItem.delete({ where: { id: item.id } });

    const pricing = await computeCartPricing(user.id);
    return ok(pricing);
  } catch (err) {
    return handleApiError(err);
  }
}
