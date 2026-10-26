// /api/seller/products — GET own listings (paginated) · POST create new listing (PENDING moderation).
import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, getPagination, paginated, ApiHttpError } from "@/lib/http";
import { requireSeller } from "@/lib/auth";
import { parseJsonArray, parseJsonObject, toJson } from "@/lib/json";
import { logAudit } from "@/lib/audit";
import type { SellerProduct } from "@/lib/types";

type SellerProductRow = Prisma.ProductGetPayload<{
  include: {
    category: { select: { name: true } };
    brand: { select: { name: true } };
    images: true;
    variants: { include: { inventory: true } };
  };
}>;

function toSellerProduct(p: SellerProductRow): SellerProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    categoryName: p.category?.name ?? "",
    brandName: p.brand?.name ?? null,
    images: [...p.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url),
    description: p.description,
    highlights: parseJsonArray<string>(p.highlights),
    specifications: parseJsonObject<Record<string, string>>(p.specifications, {}),
    warrantyMonths: p.warrantyMonths,
    returnDays: p.returnDays,
    codAvailable: p.codAvailable,
    moderationNote: p.moderationNote,
    variants: p.variants.map((v) => {
      const onHand = v.inventory?.onHand ?? 0;
      const reserved = v.inventory?.reserved ?? 0;
      return {
        id: v.id,
        sku: v.sku,
        name: v.name,
        attributes: parseJsonObject<Record<string, string>>(v.attributes, {}),
        mrp: v.mrp,
        price: v.price,
        onHand,
        reserved,
        availableQty: onHand - reserved,
      };
    }),
    createdAt: p.createdAt.toISOString(),
  };
}

const productInclude = {
  category: { select: { name: true } },
  brand: { select: { name: true } },
  images: true,
  variants: { include: { inventory: true } },
} satisfies Prisma.ProductInclude;

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return base || "product";
}

async function uniqueSlug(base: string): Promise<string> {
  if (!(await db.product.findUnique({ where: { slug: base } }))) return base;
  for (let i = 0; i < 6; i++) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    if (!(await db.product.findUnique({ where: { slug: candidate } }))) return candidate;
  }
  return `${base}-${Date.now()}`;
}

const variantInput = z.object({
  sku: z
    .string()
    .min(2, "SKU is too short")
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "SKU may only contain letters, numbers, - and _"),
  name: z.string().min(1, "Variant name is required").max(120),
  attributes: z.record(z.string(), z.string()).default({}),
  mrp: z.number().int().positive("MRP must be a positive integer (paise)"),
  price: z.number().int().positive("Price must be a positive integer (paise)"),
  onHand: z.number().int().min(0).default(0),
});

const createSchema = z
  .object({
    name: z.string().min(3).max(150),
    description: z.string().min(10, "Description is too short").max(5000),
    highlights: z.array(z.string().min(1).max(200)).max(12).default([]),
    specifications: z.record(z.string(), z.string()).default({}),
    categoryId: z.string().min(1, "Category is required"),
    brandId: z.string().nullable().optional(),
    images: z.array(z.object({ url: z.string().min(1).max(500) })).min(1, "At least one image is required").max(8),
    variants: z.array(variantInput).min(1, "At least one variant is required").max(20),
    warrantyMonths: z.number().int().min(0).max(60).default(0),
    returnDays: z.number().int().min(0).max(90).default(7),
    codAvailable: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    for (const [i, variant] of v.variants.entries()) {
      if (variant.mrp < variant.price) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "mrp"], message: "MRP must be greater than or equal to price" });
      }
    }
  });

export async function GET(req: NextRequest) {
  try {
    const session = await requireSeller();
    const sp = req.nextUrl.searchParams;
    const p = getPagination(sp, 12);
    const status = sp.get("status")?.toUpperCase();
    const q = sp.get("q");

    const where: Prisma.ProductWhereInput = {
      sellerId: session.sellerId,
      ...(status ? { status } : {}),
      ...(q ? { name: { contains: q } } : {}),
    };

    const [rows, total] = await Promise.all([
      db.product.findMany({
        where,
        include: productInclude,
        orderBy: { createdAt: "desc" },
        skip: p.skip,
        take: p.take,
      }),
      db.product.count({ where }),
    ]);

    return ok(paginated(rows.map(toSellerProduct), total, p));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSeller();
    const body = await parseBody(req, createSchema);

    const category = await db.category.findUnique({ where: { id: body.categoryId } });
    if (!category) throw new ApiHttpError(422, "INVALID_CATEGORY", "Selected category does not exist");

    if (body.brandId) {
      const brand = await db.brand.findUnique({ where: { id: body.brandId } });
      if (!brand) throw new ApiHttpError(422, "INVALID_BRAND", "Selected brand does not exist");
    }

    const skus = body.variants.map((v) => v.sku);
    const skuClash = await db.productVariant.findFirst({ where: { sku: { in: skus } }, select: { sku: true } });
    if (skuClash) throw new ApiHttpError(422, "SKU_TAKEN", `SKU "${skuClash.sku}" is already in use`);

    const slug = await uniqueSlug(slugify(body.name));

    const created = await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sellerId: session.sellerId,
          categoryId: body.categoryId,
          brandId: body.brandId ?? null,
          name: body.name,
          slug,
          description: body.description,
          highlights: toJson(body.highlights),
          specifications: toJson(body.specifications),
          warrantyMonths: body.warrantyMonths,
          returnDays: body.returnDays,
          codAvailable: body.codAvailable,
          status: "PENDING",
          keywords: body.name.toLowerCase(),
          images: {
            create: body.images.map((img, idx) => ({ url: img.url, sortOrder: idx })),
          },
          variants: {
            create: body.variants.map((v) => ({
              sku: v.sku,
              name: v.name,
              attributes: toJson(v.attributes),
              mrp: v.mrp,
              price: v.price,
              isActive: true,
              inventory: { create: { onHand: v.onHand, reserved: 0 } },
            })),
          },
        },
      });
      // Primary offer anchored at the first variant's price.
      await tx.sellerOffer.create({
        data: {
          productId: product.id,
          sellerId: session.sellerId,
          price: body.variants[0].price,
          mrp: body.variants[0].mrp,
          isPrimary: true,
          deliveryDays: 3,
        },
      });
      return product;
    });

    await logAudit({
      actorId: session.id,
      actorRole: session.role,
      actorEmail: session.email,
      action: "PRODUCT_CREATED",
      entityType: "product",
      entityId: created.id,
      meta: { name: created.name, variants: body.variants.length },
    });

    const full = await db.product.findUnique({ where: { id: created.id }, include: productInclude });
    return ok(toSellerProduct(full!), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
