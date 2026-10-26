// POST /api/checkout/validate — recompute pricing (with optional coupon),
// list the user's addresses, and report COD eligibility for the current cart.
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { computeCartPricing } from "@/lib/pricing";
import { SHIPPING_CONFIG } from "@/lib/constants";
import { db } from "@/lib/db";
import type { AddressView, CheckoutValidateResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  addressId: z.string().min(1).optional(),
  couponCode: z.string().trim().min(1).max(40).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseBody(req, bodySchema);

    // computeCartPricing sweeps expired reservations and falls back to the
    // coupon stored on the cart when none is passed explicitly.
    const pricing = await computeCartPricing(user.id, {
      couponCode: body.couponCode ?? undefined,
    });

    if (pricing.items.length === 0) {
      throw new ApiHttpError(422, "CART_EMPTY", "Your cart is empty");
    }

    const addresses = await db.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });

    const addressViews: AddressView[] = addresses.map((a) => ({
      id: a.id,
      fullName: a.fullName,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2,
      landmark: a.landmark,
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      type: a.type,
      isDefault: a.isDefault,
    }));

    const codAllowed =
      pricing.items.every((i) => i.codAvailable) &&
      pricing.grandTotal <= SHIPPING_CONFIG.COD_MAX_ORDER_PAISE &&
      pricing.issues.length === 0;

    const res: CheckoutValidateResponse = {
      pricing,
      addresses: addressViews,
      codAllowed,
      codFee: SHIPPING_CONFIG.COD_FEE_PAISE,
    };
    return ok(res);
  } catch (err) {
    return handleApiError(err);
  }
}
