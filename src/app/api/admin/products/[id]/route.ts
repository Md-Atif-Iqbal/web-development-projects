// PATCH /api/admin/products/[id] — moderation: activate / reject / archive.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { notify } from "@/lib/orders";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  action: z.enum(["activate", "reject", "archive"]),
  note: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(req, bodySchema);

    const product = await db.product.findUnique({
      where: { id },
      include: {
        seller: { include: { user: { select: { id: true } } } },
        images: { select: { id: true } },
        variants: { select: { id: true, price: true, isActive: true } },
      },
    });
    if (!product) throw new ApiHttpError(404, "NOT_FOUND", "Product not found");

    let status: string;
    let auditAction: string;
    let moderationNote: string | null = body.note ?? null;

    if (body.action === "activate") {
      const hasSellableVariant = product.variants.some((v) => v.isActive && v.price > 0);
      const hasImage = product.images.length > 0;
      if (!hasSellableVariant || !hasImage) {
        throw new ApiHttpError(
          422,
          "PRODUCT_INCOMPLETE",
          "Product needs at least one active variant with price > 0 and one image before activation"
        );
      }
      status = "ACTIVE";
      auditAction = "PRODUCT_ACTIVATED";
    } else if (body.action === "reject") {
      status = "REJECTED";
      auditAction = "PRODUCT_REJECTED";
      moderationNote = body.note ?? "Listing rejected by marketplace moderation";
    } else {
      status = "ARCHIVED";
      auditAction = "PRODUCT_ARCHIVED";
    }

    await db.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { status, moderationNote } });
      if (body.action === "activate") {
        await notify(tx, product.seller.userId, "SELLER", `Product approved: ${product.name}`, "Your listing is now live on the marketplace.");
      } else if (body.action === "reject") {
        await notify(tx, product.seller.userId, "SELLER", `Product rejected: ${product.name}`, moderationNote ?? undefined);
      } else {
        await notify(tx, product.seller.userId, "SELLER", `Product archived: ${product.name}`, "Your listing has been archived by marketplace moderation.");
      }
    });

    await logAudit({
      actorId: admin.id,
      actorRole: admin.role,
      actorEmail: admin.email,
      action: auditAction,
      entityType: "product",
      entityId: id,
      meta: { note: moderationNote },
    });

    return ok({ item: { id, status, moderationNote } });
  } catch (err) {
    return handleApiError(err);
  }
}
