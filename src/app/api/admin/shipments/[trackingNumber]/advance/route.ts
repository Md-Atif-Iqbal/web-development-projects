// POST /api/admin/shipments/[trackingNumber]/advance — sandbox logistics progression.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError, ApiHttpError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { advanceShipment, getTracking } from "@/lib/logistics/mock";
import { logAudit } from "@/lib/audit";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ trackingNumber: string }> }) {
  try {
    const admin = await requireAdmin();
    const { trackingNumber } = await params;

    const shipment = await db.shipment.findUnique({ where: { trackingNumber } });
    if (!shipment) throw new ApiHttpError(404, "NOT_FOUND", "Shipment not found");

    const result = await advanceShipment(trackingNumber);

    await logAudit({
      actorId: admin.id,
      actorRole: admin.role,
      actorEmail: admin.email,
      action: "SHIPMENT_ADVANCED",
      entityType: "shipment",
      entityId: shipment.id,
      meta: { trackingNumber, status: result.status },
    });

    const tracking = await getTracking(trackingNumber);
    return ok({ tracking });
  } catch (err) {
    return handleApiError(err);
  }
}
