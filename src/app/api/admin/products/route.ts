// GET /api/admin/products — moderation queue / catalog list with seller, category, first image.
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, getPagination, paginated } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const p = getPagination(sp, 20);
    const status = sp.get("status")?.toUpperCase();
    const q = sp.get("q");
    const categoryId = sp.get("categoryId");

    const where: Prisma.ProductWhereInput = {
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(q ? { name: { contains: q } } : {}),
    };

    const [rows, total] = await Promise.all([
      db.product.findMany({
        where,
        include: {
          seller: { select: { businessName: true, status: true } },
          category: { select: { name: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 1 },
          variants: { select: { price: true, isActive: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: p.skip,
        take: p.take,
      }),
      db.product.count({ where }),
    ]);

    const items = rows.map((prod) => ({
      id: prod.id,
      name: prod.name,
      slug: prod.slug,
      status: prod.status,
      sellerId: prod.sellerId,
      sellerName: prod.seller.businessName,
      sellerStatus: prod.seller.status,
      categoryName: prod.category.name,
      image: prod.images[0]?.url ?? null,
      variantCount: prod.variants.length,
      price: prod.variants.length ? Math.min(...prod.variants.map((v) => v.price)) : 0,
      isFeatured: prod.isFeatured,
      moderationNote: prod.moderationNote,
      createdAt: prod.createdAt.toISOString(),
    }));

    return ok(paginated(items, total, p));
  } catch (err) {
    return handleApiError(err);
  }
}
