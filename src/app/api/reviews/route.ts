// GET  /api/reviews?productId= — paginated reviews for a product (newest first).
// POST /api/reviews — create/update the caller's review for a product.
//   Requires a DELIVERED order item for that product (verifiedPurchase=true),
//   1 review per user/product (upsert), recomputes the product's
//   ratingSum/ratingCount atomically. Rate-limited.

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, handleApiError, parseBody, getPagination, paginated } from "@/lib/http";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit, RATE } from "@/lib/rate-limit";
import type { ProductReview } from "@/lib/types";

const reviewSchema = z.object({
  productId: z.string().min(1),
  rating: z.number().int().min(1, "Rating must be between 1 and 5").max(5, "Rating must be between 1 and 5"),
  title: z.string().trim().max(140).optional(),
  body: z.string().trim().max(2000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const productId = sp.get("productId")?.trim() ?? "";
    if (!productId) return fail(422, "VALIDATION_ERROR", "productId query parameter is required");
    const p = getPagination(sp, 10, 50);

    const where = { productId };
    const [rows, total] = await Promise.all([
      db.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: p.skip,
        take: p.take,
        include: { user: { select: { name: true } } },
      }),
      db.review.count({ where }),
    ]);

    const items: ProductReview[] = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      verifiedPurchase: r.verifiedPurchase,
      createdAt: r.createdAt.toISOString(),
      userName: r.user.name,
    }));

    return ok(paginated(items, total, p));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const rl = rateLimit(`review:${user.id}`, RATE.review.limit, RATE.review.windowMs);
    if (!rl.allowed) {
      return fail(429, "RATE_LIMITED", `Too many attempts. Please try again in ${rl.retryAfterSec}s.`);
    }

    const body = await parseBody(req, reviewSchema);

    const product = await db.product.findUnique({ where: { id: body.productId }, select: { id: true, status: true } });
    if (!product) return fail(404, "NOT_FOUND", "Product not found");

    // Verified purchase: the user must have a DELIVERED order containing this product.
    const purchased = await db.orderItem.findFirst({
      where: { productId: product.id, order: { userId: user.id, status: "DELIVERED" } },
      select: { id: true },
    });
    if (!purchased) {
      return fail(
        403,
        "REVIEW_NOT_ALLOWED",
        "You can only review products you have purchased and received"
      );
    }

    const review = await db.$transaction(async (tx) => {
      const saved = await tx.review.upsert({
        where: { productId_userId: { productId: product.id, userId: user.id } },
        update: {
          rating: body.rating,
          title: body.title ?? null,
          body: body.body ?? null,
          verifiedPurchase: true,
        },
        create: {
          productId: product.id,
          userId: user.id,
          rating: body.rating,
          title: body.title ?? null,
          body: body.body ?? null,
          verifiedPurchase: true,
        },
      });

      // Keep product aggregates authoritative: recompute from all reviews.
      const agg = await tx.review.aggregate({
        where: { productId: product.id },
        _sum: { rating: true },
        _count: { _all: true },
      });
      await tx.product.update({
        where: { id: product.id },
        data: { ratingSum: agg._sum.rating ?? 0, ratingCount: agg._count._all },
      });

      return saved;
    });

    const item: ProductReview = {
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      verifiedPurchase: review.verifiedPurchase,
      createdAt: review.createdAt.toISOString(),
      userName: user.name,
    };
    return ok(item, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
