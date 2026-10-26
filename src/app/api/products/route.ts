// GET /api/products — paginated, faceted product listing (ACTIVE only).
// Query: q, category (slug), brand (CSV slugs), minPrice/maxPrice (RUPEES),
// rating (min), inStock ("1"), sort, page, pageSize, featured ("1"), sellerId.
// Card price = min variant price; image = first ProductImage; inStock if any
// variant has onHand - reserved > 0; seller name from the primary offer seller.
// Search = case-insensitive contains on name + keywords + brand + category
// (SQLite LIKE is case-insensitive for ASCII).

import { NextRequest } from "next/server";
import { ok, handleApiError, getPagination } from "@/lib/http";
import { db } from "@/lib/db";
import { rupeesToPaise, discountPercent } from "@/lib/money";
import type { ProductCard, ProductListResponse } from "@/lib/types";

const SORTS = ["relevance", "price_asc", "price_desc", "rating", "newest", "popular"] as const;
type Sort = (typeof SORTS)[number];

type Row = {
  id: string;
  name: string;
  slug: string;
  isFeatured: boolean;
  soldCount: number;
  ratingSum: number;
  ratingCount: number;
  createdAt: Date;
  brand: { id: string; name: string; slug: string } | null;
  category: { id: string; name: string; slug: string };
  images: { url: string; sortOrder: number }[];
  variants: { price: number; mrp: number; inventory: { onHand: number; reserved: number } | null }[];
  seller: { businessName: string };
  offers: { seller: { businessName: string } }[];
};

type Card = ProductCard & { createdAt: Date; soldCount: number };

function ratingOf(ratingSum: number, ratingCount: number): number {
  if (ratingCount <= 0) return 0;
  return Math.round((ratingSum / ratingCount) * 10) / 10;
}

function toCard(row: Row): Card {
  const cheapest = [...row.variants].sort((a, b) => a.price - b.price)[0];
  const price = cheapest?.price ?? 0;
  const mrp = cheapest?.mrp ?? price;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    image: row.images[0]?.url ?? null,
    price,
    mrp,
    discountPercent: discountPercent(mrp, price),
    rating: ratingOf(row.ratingSum, row.ratingCount),
    ratingCount: row.ratingCount,
    brand: row.brand?.name ?? null,
    categoryName: row.category.name,
    inStock: row.variants.some((v) => (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0) > 0),
    // Primary offer seller wins; fall back to the listing owner (seed data
    // quirk: one product is missing its primary offer).
    sellerName: row.offers[0]?.seller.businessName ?? row.seller.businessName,
    isFeatured: row.isFeatured,
    createdAt: row.createdAt,
    soldCount: row.soldCount,
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const p = getPagination(sp, 12, 50);

    const q = sp.get("q")?.trim() || null;
    const categorySlug = sp.get("category")?.trim() || null;
    const brandSlugs = (sp.get("brand") || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const sellerId = sp.get("sellerId")?.trim() || null;
    const featured = sp.get("featured") === "1";
    const inStockOnly = sp.get("inStock") === "1";
    const sortParam = sp.get("sort");
    const sort: Sort =
      sortParam && (SORTS as readonly string[]).includes(sortParam) ? (sortParam as Sort) : "relevance";

    const ratingMin = Number(sp.get("rating"));
    const hasRatingMin = sp.get("rating") !== null && Number.isFinite(ratingMin) && ratingMin > 0;

    let minPrice: number | null = null;
    let maxPrice: number | null = null;
    if (sp.get("minPrice") !== null && Number.isFinite(Number(sp.get("minPrice")))) {
      minPrice = rupeesToPaise(Number(sp.get("minPrice")));
    }
    if (sp.get("maxPrice") !== null && Number.isFinite(Number(sp.get("maxPrice")))) {
      maxPrice = rupeesToPaise(Number(sp.get("maxPrice")));
    }

    // Category filter: include the category itself + all descendant
    // categories (parent slugs like "electronics"/"fashion" should surface
    // products from their children).
    let categoryFilter: { categoryId: { in: string[] } } | { category: { slug: string; isActive: true } } | null = null;
    if (categorySlug) {
      const root = await db.category.findUnique({ where: { slug: categorySlug }, select: { id: true } });
      if (!root) {
        return ok({
          items: [],
          total: 0,
          page: p.page,
          pageSize: p.pageSize,
          totalPages: 1,
          facets: { brands: [], priceRange: { min: 0, max: 0 }, categories: [] },
        } satisfies ProductListResponse);
      }
      const children = await db.category.findMany({
        where: { OR: [{ parentId: root.id }, { parent: { parentId: root.id } }] },
        select: { id: true },
      });
      categoryFilter = { categoryId: { in: [root.id, ...children.map((c) => c.id)] } };
    }

    // Core DB filter: status + text search + category + seller + featured.
    // Brand/price/rating/inStock refinements + facets applied in memory below
    // (catalog is small; keeps facet counts + min-variant-price logic simple).
    const rows: Row[] = await db.product.findMany({
      where: {
        status: "ACTIVE",
        ...(categoryFilter ?? {}),
        ...(sellerId ? { sellerId } : {}),
        ...(featured ? { isFeatured: true } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { keywords: { contains: q } },
                { brand: { name: { contains: q } } },
                { category: { name: { contains: q } } },
              ],
            }
          : {}),
      },
      include: {
        brand: { select: { id: true, name: true, slug: true } },
        category: { select: { id: true, name: true, slug: true } },
        seller: { select: { businessName: true } },
        images: { orderBy: { sortOrder: "asc" } },
        variants: { include: { inventory: true }, orderBy: { price: "asc" } },
        offers: {
          where: { isActive: true, isPrimary: true, seller: { status: "APPROVED" } },
          include: { seller: { select: { businessName: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const cards = rows.map(toCard);

    // ── Facets over the core filtered set (before refinements) ──
    const brandFacets = new Map<string, { id: string; name: string; count: number }>();
    const categoryFacets = new Map<string, { id: string; name: string; slug: string; count: number }>();
    let facetMin = Number.POSITIVE_INFINITY;
    let facetMax = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const card = cards[i];
      if (row.brand) {
        const b = brandFacets.get(row.brand.id);
        if (b) b.count += 1;
        else brandFacets.set(row.brand.id, { id: row.brand.id, name: row.brand.name, count: 1 });
      }
      const c = categoryFacets.get(row.category.id);
      if (c) c.count += 1;
      else
        categoryFacets.set(row.category.id, {
          id: row.category.id,
          name: row.category.name,
          slug: row.category.slug,
          count: 1,
        });
      if (Number.isFinite(card.price)) {
        facetMin = Math.min(facetMin, card.price);
        facetMax = Math.max(facetMax, card.price);
      }
    }

    // ── Refinement filters ──
    let filtered = cards;
    if (brandSlugs.length > 0) {
      const allowedBrandIds = new Set(rows.filter((r) => r.brand && brandSlugs.includes(r.brand.slug)).map((r) => r.id));
      filtered = filtered.filter((c) => allowedBrandIds.has(c.id));
    }
    if (minPrice !== null) filtered = filtered.filter((c) => c.price >= minPrice);
    if (maxPrice !== null) filtered = filtered.filter((c) => c.price <= maxPrice);
    if (hasRatingMin) filtered = filtered.filter((c) => c.rating >= ratingMin);
    if (inStockOnly) filtered = filtered.filter((c) => c.inStock);

    // ── Sorting ──
    switch (sort) {
      case "price_asc":
        filtered.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        filtered.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        filtered.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
        break;
      case "newest":
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case "popular":
        filtered.sort((a, b) => b.soldCount - a.soldCount);
        break;
      case "relevance":
      default:
        filtered.sort(
          (a, b) =>
            (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0) ||
            b.soldCount - a.soldCount ||
            b.rating - a.rating
        );
        break;
    }

    const total = filtered.length;
    const pageItems = filtered.slice(p.skip, p.skip + p.take);

    const response: ProductListResponse = {
      items: pageItems.map(({ createdAt: _c, soldCount: _s, ...card }) => card),
      total,
      page: p.page,
      pageSize: p.pageSize,
      totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
      facets: {
        brands: [...brandFacets.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        priceRange: {
          min: cards.length > 0 && Number.isFinite(facetMin) ? facetMin : 0,
          max: cards.length > 0 ? facetMax : 0,
        },
        categories: [...categoryFacets.values()].sort(
          (a, b) => b.count - a.count || a.name.localeCompare(b.name)
        ),
      },
    };
    return ok(response);
  } catch (err) {
    return handleApiError(err);
  }
}
