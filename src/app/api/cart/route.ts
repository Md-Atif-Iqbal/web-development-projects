// GET /api/cart — authoritative server-computed cart pricing view.
// Sweeps expired reservations so availability is accurate.

import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { computeCartPricing } from "@/lib/pricing";

export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    const pricing = await computeCartPricing(user.id, { sweepReservations: true });
    return ok(pricing);
  } catch (err) {
    return handleApiError(err);
  }
}
