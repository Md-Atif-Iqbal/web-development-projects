// /api/admin/brands — GET all · POST create.
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
  return base || `brand-${Date.now()}`;
}

async function uniqueBrandSlug(base: string): Promise<string> {
  let slug = base;
  let i = 1;
  while (await db.brand.findUnique({ where: { slug } })) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, "Slug may contain lowercase letters, numbers and -").optional(),
});

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const brands = await db.brand.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return ok({
      items: brands.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        logoUrl: b.logoUrl,
        productCount: b._count.products,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await parseBody(req, createSchema);

    if (body.slug && (await db.brand.findUnique({ where: { slug: body.slug } }))) {
      throw new ApiHttpError(409, "SLUG_TAKEN", `Brand slug "${body.slug}" is already in use`);
    }

    const slug = await uniqueBrandSlug(body.slug ?? slugify(body.name));
    const brand = await db.brand.create({ data: { name: body.name, slug } });

    await logAudit({
      actorId: admin.id,
      actorRole: admin.role,
      actorEmail: admin.email,
      action: "BRAND_CREATED",
      entityType: "brand",
      entityId: brand.id,
      meta: { name: brand.name, slug: brand.slug },
    });

    return ok({ item: brand }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
