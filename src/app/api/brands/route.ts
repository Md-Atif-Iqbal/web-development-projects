// GET /api/brands — all brands, alphabetical.

import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/http";
import { db } from "@/lib/db";
import type { Brand } from "@/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const brands = await db.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    });
    const items: Brand[] = brands;
    return ok({ items });
  } catch (err) {
    return handleApiError(err);
  }
}
