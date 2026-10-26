// GET /api/categories — ACTIVE category tree (roots with nested children),
// ordered by sortOrder then name.

import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/http";
import { db } from "@/lib/db";
import type { Category } from "@/lib/types";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  imageUrl: string | null;
  sortOrder: number;
  children: { id: string; name: string; slug: string; icon: string | null; imageUrl: string | null; sortOrder: number }[];
};

export async function GET(_req: NextRequest) {
  try {
    const roots = await db.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        children: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, slug: true, icon: true, imageUrl: true, sortOrder: true },
        },
      },
    });

    const items: Category[] = roots.map((root: CategoryRow) => ({
      id: root.id,
      name: root.name,
      slug: root.slug,
      icon: root.icon,
      imageUrl: root.imageUrl,
      children: root.children.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        imageUrl: c.imageUrl,
        children: [],
      })),
    }));

    return ok({ items });
  } catch (err) {
    return handleApiError(err);
  }
}
