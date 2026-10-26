// POST /api/cart/coupon {code} — apply a coupon to the caller's cart.
// An empty string (or whitespace) removes the stored coupon. Validation runs
// server-side via validateCoupon against the no-coupon itemsTotal; the valid
// code is persisted on the cart. Returns the recomputed CartPricingView.

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, handleApiError, parseBody } from "@/lib/http";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { computeCartPricing, validateCoupon } from "@/lib/pricing";

const couponSchema = z.object({
  code: z.string().max(40, "Coupon code is too long"),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseBody(req, couponSchema);
    const code = body.code.trim().toUpperCase();

    // Removal (idempotent).
    if (code === "") {
      const cart = await db.cart.findUnique({ where: { userId: user.id } });
      if (cart && cart.couponCode) {
        await db.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
      }
      const pricing = await computeCartPricing(user.id);
      return ok(pricing);
    }

    // Validate against the no-coupon itemsTotal (computeCartPricing with an
    // empty couponCode overrides any stored one).
    const basePricing = await computeCartPricing(user.id, { couponCode: "" });
    const validated = await validateCoupon(code, user.id, basePricing.itemsTotal);

    await db.cart.upsert({
      where: { userId: user.id },
      update: { couponCode: validated.code },
      create: { userId: user.id, couponCode: validated.code },
    });

    const pricing = await computeCartPricing(user.id);
    return ok(pricing);
  } catch (err) {
    return handleApiError(err);
  }
}
