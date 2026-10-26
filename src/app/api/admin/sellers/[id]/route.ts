// PATCH /api/admin/sellers/[id] — approve / reject / suspend / reactivate a seller.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { notify } from "@/lib/orders";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  action: z.enum(["approve", "reject", "suspend", "reactivate"]),
  note: z.string().max(500).optional(),
  commissionBps: z.number().int().min(0).max(10000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(req, bodySchema);

    const seller = await db.seller.findUnique({ where: { id }, include: { user: true } });
    if (!seller) throw new ApiHttpError(404, "NOT_FOUND", "Seller not found");

    const { action, note, commissionBps } = body;

    await db.$transaction(async (tx) => {
      const commissionPatch = commissionBps !== undefined ? { commissionBps } : {};

      if (action === "approve") {
        await tx.seller.update({ where: { id }, data: { status: "APPROVED", ...commissionPatch } });
        await tx.sellerVerification.upsert({
          where: { sellerId: id },
          update: {
            status: "APPROVED",
            reviewerNote: note ?? null,
            reviewedById: admin.id,
            reviewedAt: new Date(),
          },
          create: {
            sellerId: id,
            status: "APPROVED",
            reviewerNote: note ?? null,
            reviewedById: admin.id,
            reviewedAt: new Date(),
          },
        });
        await notify(
          tx,
          seller.userId,
          "SELLER",
          "Seller account approved",
          "Congratulations! Your seller account is live — you can start listing products."
        );
      }

      if (action === "reject") {
        await tx.seller.update({ where: { id }, data: { status: "REJECTED", ...commissionPatch } });
        await tx.sellerVerification.upsert({
          where: { sellerId: id },
          update: {
            status: "REJECTED",
            reviewerNote: note ?? null,
            reviewedById: admin.id,
            reviewedAt: new Date(),
          },
          create: {
            sellerId: id,
            status: "REJECTED",
            reviewerNote: note ?? null,
            reviewedById: admin.id,
            reviewedAt: new Date(),
          },
        });
        await tx.product.updateMany({
          where: { sellerId: id, status: "ACTIVE" },
          data: { status: "ARCHIVED" },
        });
        await notify(
          tx,
          seller.userId,
          "SELLER",
          "Seller application rejected",
          note ?? "Your seller application was not approved. Contact support for details."
        );
      }

      if (action === "suspend") {
        await tx.seller.update({ where: { id }, data: { status: "SUSPENDED", ...commissionPatch } });
        await tx.product.updateMany({
          where: { sellerId: id, status: "ACTIVE" },
          data: { status: "ARCHIVED" },
        });
        await notify(
          tx,
          seller.userId,
          "SELLER",
          "Seller account suspended",
          note ?? "Your seller account has been suspended. Contact support for details."
        );
      }

      if (action === "reactivate") {
        await tx.seller.update({ where: { id }, data: { status: "APPROVED", ...commissionPatch } });
        await tx.sellerVerification.updateMany({
          where: { sellerId: id },
          data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: new Date(), ...(note !== undefined ? { reviewerNote: note } : {}) },
        });
        // Archived listings come back for moderation before going live again.
        await tx.product.updateMany({
          where: { sellerId: id, status: "ARCHIVED" },
          data: { status: "PENDING" },
        });
        await notify(
          tx,
          seller.userId,
          "SELLER",
          "Seller account reactivated",
          "Your seller account is active again. Your listings will be re-reviewed before going live."
        );
      }
    });

    const auditAction =
      action === "approve"
        ? "SELLER_APPROVED"
        : action === "reject"
          ? "SELLER_REJECTED"
          : action === "suspend"
            ? "SELLER_SUSPENDED"
            : "SELLER_REACTIVATED";

    await logAudit({
      actorId: admin.id,
      actorRole: admin.role,
      actorEmail: admin.email,
      action: auditAction,
      entityType: "seller",
      entityId: id,
      meta: { note: note ?? null, commissionBps: commissionBps ?? null },
    });

    const updated = await db.seller.findUnique({ where: { id } });
    return ok({ seller: updated ? { id: updated.id, status: updated.status, commissionBps: updated.commissionBps } : null });
  } catch (err) {
    return handleApiError(err);
  }
}
