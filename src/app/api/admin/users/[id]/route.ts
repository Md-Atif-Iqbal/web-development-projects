// PATCH /api/admin/users/[id] — suspend / activate a user.
// Suspending a SELLER user also suspends their seller account and archives ACTIVE products.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { notify } from "@/lib/orders";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  action: z.enum(["suspend", "activate"]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(req, bodySchema);

    const target = await db.user.findUnique({ where: { id }, include: { seller: true } });
    if (!target) throw new ApiHttpError(404, "NOT_FOUND", "User not found");

    if (body.action === "suspend") {
      if (target.id === admin.id) {
        throw new ApiHttpError(403, "CANNOT_SUSPEND_SELF", "You cannot suspend your own account");
      }
      if (target.role === "ADMIN") {
        throw new ApiHttpError(403, "CANNOT_SUSPEND_ADMIN", "Admin accounts cannot be suspended");
      }
    }

    await db.$transaction(async (tx) => {
      if (body.action === "suspend") {
        await tx.user.update({ where: { id }, data: { status: "SUSPENDED" } });
        if (target.seller) {
          await tx.seller.update({ where: { id: target.seller.id }, data: { status: "SUSPENDED" } });
          await tx.product.updateMany({
            where: { sellerId: target.seller.id, status: "ACTIVE" },
            data: { status: "ARCHIVED" },
          });
        }
        await notify(tx, target.id, "SYSTEM", "Account suspended", "Your account has been suspended. Contact support for assistance.");
      } else {
        await tx.user.update({ where: { id }, data: { status: "ACTIVE" } });
        if (target.seller && target.seller.status === "SUSPENDED") {
          await tx.seller.update({ where: { id: target.seller.id }, data: { status: "APPROVED" } });
        }
        await notify(tx, target.id, "SYSTEM", "Account activated", "Your account has been reactivated. Welcome back!");
      }
    });

    await logAudit({
      actorId: admin.id,
      actorRole: admin.role,
      actorEmail: admin.email,
      action: body.action === "suspend" ? "USER_SUSPENDED" : "USER_ACTIVATED",
      entityType: "user",
      entityId: id,
      meta: { targetEmail: target.email, targetRole: target.role },
    });

    const updated = await db.user.findUnique({ where: { id }, select: { id: true, status: true, role: true } });
    return ok({ user: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
