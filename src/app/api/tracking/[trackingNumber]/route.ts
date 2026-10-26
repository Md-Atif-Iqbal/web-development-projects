// GET /api/tracking/[trackingNumber] — sandbox logistics tracking view.
// Accessible only to the shipment's order owner or an admin (404 otherwise).
import { NextRequest } from "next/server";
import { ok, handleApiError, ApiHttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getTracking } from "@/lib/logistics/mock";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/constants";
import type { TrackingView } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ trackingNumber: string }> }) {
  try {
    const { trackingNumber } = await params;
    const user = await requireUser();

    // Ownership probe (getTracking does not expose the owner).
    const shipment = await db.shipment.findUnique({
      where: { trackingNumber },
      select: { fulfillment: { select: { order: { select: { userId: true } } } } },
    });
    if (!shipment) throw new ApiHttpError(404, "NOT_FOUND", "Tracking not found");
    const ownerId = shipment.fulfillment?.order?.userId;
    if (!ownerId || (ownerId !== user.id && user.role !== ROLES.ADMIN)) {
      throw new ApiHttpError(404, "NOT_FOUND", "Tracking not found");
    }

    const t = await getTracking(trackingNumber);
    if (!t) throw new ApiHttpError(404, "NOT_FOUND", "Tracking not found");

    const view: TrackingView = {
      trackingNumber: t.trackingNumber,
      provider: t.provider,
      status: t.status,
      estimatedDelivery: t.estimatedDelivery ? new Date(t.estimatedDelivery).toISOString() : null,
      deliveredAt: t.deliveredAt ? new Date(t.deliveredAt).toISOString() : null,
      events: t.events,
      orderNumber: t.orderNumber,
      sellerName: t.sellerName,
    };
    return ok(view);
  } catch (err) {
    return handleApiError(err);
  }
}
