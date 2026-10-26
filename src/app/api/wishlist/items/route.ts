// POST /api/wishlist/items {productId} — add a product to the caller's
// wishlist. Idempotent: re-adding an existing item is a no-op. Returns the
// full wishlist item list.

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, handleApiError, parseBody } from "@/lib/http";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { discountPercent } from "@/lib/money";
import type { WishlistItemView } from "@/lib/types";

const addItemSchema = z.object({
  productId: z.string().min(1),
});

function rating1dp(sum: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round((sum / count) * 10) / 10;
}

async function wishlistItemsOf(userId: string): Promise<WishlistItemView[]> {
  const wishlist = await db.wishlist.findUnique({
    where: { userId },
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
  return (wishlist?.items ?? []).map((w) => {
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
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseBody(req, addItemSchema);

    const product = await db.product.findUnique({
      where: { id: body.productId },
      select: { id: true, status: true },
    });
    if (!product || product.status !== "ACTIVE") {
      return fail(404, "NOT_FOUND", "Product not found or no longer available");
    }

    const wishlist = await db.wishlist.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    await db.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId: product.id } },
      update: {},
      create: { wishlistId: wishlist.id, productId: product.id },
    });

    return ok({ items: await wishlistItemsOf(user.id) }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
