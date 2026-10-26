// GET /api/products/[slug] — product detail (ACTIVE only, else 404).
// Includes ACTIVE offers from APPROVED sellers + variant availability.
// Tracks a PRODUCT_VIEW analytics event (fire-and-forget).

import { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/http";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { parseJsonArray, parseJsonObject, toJson } from "@/lib/json";
import type { ProductDetail, ProductVariantView, SellerOfferView } from "@/lib/types";

function rating1dp(sum: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round((sum / count) * 10) / 10;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    const product = await db.product.findUnique({
      where: { slug },
      include: {
        brand: { select: { name: true } },
        category: { select: { id: true, name: true, slug: true } },
        seller: { select: { id: true, businessName: true, status: true, ratingSum: true, ratingCount: true } },
        images: { orderBy: { sortOrder: "asc" } },
        variants: {
          where: { isActive: true },
          orderBy: { price: "asc" },
          include: { inventory: true },
        },
        offers: {
          where: { isActive: true, seller: { status: "APPROVED" } },
          orderBy: { price: "asc" },
          include: { seller: { select: { id: true, businessName: true } } },
        },
      },
    });

    if (!product || product.status !== "ACTIVE") {
      return fail(404, "NOT_FOUND", "Product not found");
    }

    // Analytics: PRODUCT_VIEW (non-blocking; never fails the request).
    const viewer = await getSessionUser().catch(() => null);
    db.analyticsEvent
      .create({
        data: {
          userId: viewer?.id ?? null,
          type: "PRODUCT_VIEW",
          payload: toJson({ productId: product.id, slug: product.slug }),
        },
      })
      .catch(() => undefined);

    const variants: ProductVariantView[] = product.variants.map((v) => {
      const availableQty = Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0));
      return {
        id: v.id,
        sku: v.sku,
        name: v.name,
        attributes: parseJsonObject<Record<string, string>>(v.attributes, {}),
        mrp: v.mrp,
        price: v.price,
        availableQty,
        inStock: availableQty > 0,
      };
    });

    const offers: SellerOfferView[] = product.offers.map((o) => ({
      id: o.id,
      sellerId: o.sellerId,
      sellerName: o.seller.businessName,
      price: o.price,
      deliveryDays: o.deliveryDays,
      isPrimary: o.isPrimary,
    }));

    const detail: ProductDetail = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      highlights: parseJsonArray<string>(product.highlights, []),
      specifications: parseJsonObject<Record<string, string>>(product.specifications, {}),
      images: product.images.map((i) => i.url),
      brand: product.brand?.name ?? null,
      category: {
        id: product.category.id,
        name: product.category.name,
        slug: product.category.slug,
      },
      seller: {
        id: product.seller.id,
        name: product.seller.businessName,
        rating: product.seller.ratingCount > 0 ? rating1dp(product.seller.ratingSum, product.seller.ratingCount) : null,
      },
      variants,
      offers,
      warrantyMonths: product.warrantyMonths,
      returnDays: product.returnDays,
      codAvailable: product.codAvailable,
      rating: rating1dp(product.ratingSum, product.ratingCount),
      ratingCount: product.ratingCount,
      soldCount: product.soldCount,
      createdAt: product.createdAt.toISOString(),
    };

    return ok(detail);
  } catch (err) {
    return handleApiError(err);
  }
}
