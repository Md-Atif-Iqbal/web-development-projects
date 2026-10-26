// PATCH /api/seller/inventory/[variantId] — update on-hand stock for a variant of an own product.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireSeller } from "@/lib/auth";
import { adjustStock } from "@/lib/inventory";

const bodySchema = z.object({
  onHand: z.number().int().min(0, "Stock cannot be negative"),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ variantId: string }> }) {
  try {
    const session = await requireSeller();
    const { variantId } = await params;
    const body = await parseBody(req, bodySchema);

    const variant = await db.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { sellerId: true } }, inventory: true },
    });
    // Data isolation: variant must belong to a product owned by this seller.
    if (!variant || variant.product.sellerId !== session.sellerId) {
      throw new ApiHttpError(404, "NOT_FOUND", "Variant not found");
    }

    const inventory = variant.inventory;
    const currentOnHand = inventory?.onHand ?? 0;
    const reserved = inventory?.reserved ?? 0;

    if (body.onHand < reserved) {
      throw new ApiHttpError(
        422,
        "STOCK_BELOW_RESERVED",
        `Stock cannot go below ${reserved} reserved unit(s)`
      );
    }

    // Touch the variant row (bumps updatedAt), then apply the delta to inventory.
    await db.productVariant.update({ where: { id: variantId }, data: {} });
    const availableQty = await adjustStock(db, variantId, body.onHand - currentOnHand);

    return ok({ onHand: body.onHand, availableQty });
  } catch (err) {
    return handleApiError(err);
  }
}
