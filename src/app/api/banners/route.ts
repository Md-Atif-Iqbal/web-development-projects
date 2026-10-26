// GET /api/banners — ACTIVE banners sorted by sortOrder (home carousel).

import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/http";
import { db } from "@/lib/db";
import type { BannerView } from "@/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const banners = await db.banner.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    const items: BannerView[] = banners.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: b.imageUrl,
      ctaText: b.ctaText,
      linkType: b.linkType,
      linkValue: b.linkValue,
    }));
    return ok({ items });
  } catch (err) {
    return handleApiError(err);
  }
}
