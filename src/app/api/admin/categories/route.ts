// /api/admin/categories — GET full tree (incl. inactive) · POST create.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return base || `category-${Date.now()}`;
}

async function uniqueCategorySlug(base: string): Promise<string> {
  let slug = base;
  let i = 1;
  while (await db.category.findUnique({ where: { slug } })) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

const createSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, "Slug may contain lowercase letters, numbers and -").optional(),
  parentId: z.string().nullable().optional(),
  icon: z.string().max(60).nullable().optional(),
});

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const all = await db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, parentId: true, icon: true, imageUrl: true, isActive: true, sortOrder: true },
    });

    type Node = {
      id: string;
      name: string;
      slug: string;
      icon: string | null;
      imageUrl: string | null;
      isActive: boolean;
      sortOrder: number;
      children: Node[];
    };
    const nodes = new Map<string, Node>(
      all.map((c) => [
        c.id,
        {
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon,
          imageUrl: c.imageUrl,
          isActive: c.isActive,
          sortOrder: c.sortOrder,
          children: [],
        },
      ])
    );
    const roots: Node[] = [];
    for (const c of all) {
      const node = nodes.get(c.id)!;
      const parent = c.parentId ? nodes.get(c.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    return ok({ items: roots });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await parseBody(req, createSchema);

    if (body.parentId) {
      const parent = await db.category.findUnique({ where: { id: body.parentId } });
      if (!parent) throw new ApiHttpError(422, "INVALID_PARENT", "Parent category does not exist");
    }

    const slug = await uniqueCategorySlug(body.slug ?? slugify(body.name));

    const category = await db.category.create({
      data: {
        name: body.name,
        slug,
        parentId: body.parentId ?? null,
        icon: body.icon ?? null,
      },
    });

    await logAudit({
      actorId: admin.id,
      actorRole: admin.role,
      actorEmail: admin.email,
      action: "CATEGORY_CREATED",
      entityType: "category",
      entityId: category.id,
      meta: { name: category.name, slug: category.slug },
    });

    return ok({ item: category }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
