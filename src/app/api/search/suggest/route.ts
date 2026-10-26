// GET /api/search/suggest?q= — lightweight typeahead suggestions (max 8).
// product suggestions use the product SLUG as id; category suggestions use the
// category slug. Logs a ZERO_RESULT_SEARCH analytics event when the product
// search comes back empty (q length >= 2).

import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/http";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { toJson } from "@/lib/json";
import type { SearchSuggestion } from "@/lib/types";

const MAX_SUGGESTIONS = 8;

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return ok({ items: [] });

    const products = await db.product.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { name: { contains: q } },
          { keywords: { contains: q } },
          { brand: { name: { contains: q } } },
          { category: { name: { contains: q } } },
        ],
      },
      select: {
        slug: true,
        name: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { soldCount: "desc" },
      take: MAX_SUGGESTIONS,
    });

    const items: SearchSuggestion[] = products.map((p) => ({
      type: "product" as const,
      id: p.slug,
      label: p.name,
      sublabel: p.brand?.name ?? p.category.name,
    }));

    if (items.length < MAX_SUGGESTIONS) {
      const categories = await db.category.findMany({
        where: { isActive: true, name: { contains: q } },
        select: { slug: true, name: true },
        orderBy: { name: "asc" },
        take: MAX_SUGGESTIONS - items.length,
      });
      for (const c of categories) {
        items.push({ type: "category", id: c.slug, label: c.name, sublabel: "in Categories" });
      }
    }

    if (products.length === 0) {
      // Zero-result telemetry (non-blocking).
      const viewer = await getSessionUser().catch(() => null);
      db.analyticsEvent
        .create({
          data: {
            userId: viewer?.id ?? null,
            type: "ZERO_RESULT_SEARCH",
            payload: toJson({ q }),
          },
        })
        .catch(() => undefined);
    }

    return ok({ items });
  } catch (err) {
    return handleApiError(err);
  }
}
