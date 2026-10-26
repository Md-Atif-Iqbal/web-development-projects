// PATCH /api/admin/coupons/[id] — toggle active.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const patchSchema = z.object({
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(req, patchSchema);

    const existing = await db.coupon.findUnique({ where: { id } });
    if (!existing) throw new ApiHttpError(404, "NOT_FOUND", "Coupon not found");

    const coupon = await db.coupon.update({
      where: { id },
      data: body.isActive !== undefined ? { isActive: body.isActive } : {},
    });

    await logAudit({
      actorId: admin.id,
      actorRole: admin.role,
      actorEmail: admin.email,
      action: "COUPON_UPDATED",
      entityType: "coupon",
      entityId: id,
      meta: body,
    });

    return ok({ item: coupon });
  } catch (err) {
    return handleApiError(err);
  }
}
