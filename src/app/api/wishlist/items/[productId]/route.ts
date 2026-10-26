// DELETE /api/wishlist/items/[productId] — remove a product from the caller's
// wishlist. Idempotent: removing a missing item is a no-op. Returns the
// updated wishlist item list.

import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/http";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { discountPercent } from "@/lib/money";
import type { WishlistItemView } from "@/lib/types";

function rating1dp(sum: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round((sum / count) * 10) / 10;
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ productId: string }> }) {
  try {
    const user = await requireUser();
    const { productId } = await params;

    const wishlist = await db.wishlist.findUnique({ where: { userId: user.id } });
    if (wishlist) {
      await db.wishlistItem.deleteMany({
        where: { wishlistId: wishlist.id, productId },
      });
    }

    const remaining = await db.wishlist.findUnique({
      where: { userId: user.id },
      include: {
        items: {
          orderBy: { createdAt: "desc" },
          include: {
            product: {
              include: {
                images: { orderBy: { sortOrder: "asc" } },
                variants: { include: { inventory: true } },
              },
            },
          },
        },
      },
    });

    const items: WishlistItemView[] = (remaining?.items ?? []).map((w) => {
      const cheapest = [...w.product.variants].sort((a, b) => a.price - b.price)[0];
      const price = cheapest?.price ?? 0;
      const mrp = cheapest?.mrp ?? price;
      return {
        id: w.id,
        productId: w.productId,
        productName: w.product.name,
        slug: w.product.slug,
        image: w.product.images[0]?.url ?? null,
        price,
        mrp,
        discountPercent: discountPercent(mrp, price),
        rating: rating1dp(w.product.ratingSum, w.product.ratingCount),
        inStock: w.product.variants.some(
          (v) => (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0) > 0
        ),
        addedAt: w.createdAt.toISOString(),
      };
    });

    return ok({ items });
  } catch (err) {
    return handleApiError(err);
  }
}
