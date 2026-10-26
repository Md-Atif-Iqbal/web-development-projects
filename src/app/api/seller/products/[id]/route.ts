// /api/seller/products/[id] — GET own listing · PATCH edit (content edits re-enter moderation).
import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireSeller } from "@/lib/auth";
import { adjustStock } from "@/lib/inventory";
import { logAudit } from "@/lib/audit";
import { parseJsonArray, parseJsonObject, toJson } from "@/lib/json";
import type { SellerProduct } from "@/lib/types";

const productInclude = {
  category: { select: { name: true } },
  brand: { select: { name: true } },
  images: true,
  variants: { include: { inventory: true } },
} satisfies Prisma.ProductInclude;

type SellerProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

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
    variants: [...p.variants].map((v) => {
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

const variantInput = z.object({
  id: z.string().optional(),
  sku: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "SKU may only contain letters, numbers, - and _"),
  name: z.string().min(1).max(120),
  attributes: z.record(z.string(), z.string()).default({}),
  mrp: z.number().int().positive(),
  price: z.number().int().positive(),
  onHand: z.number().int().min(0).optional(),
});

const patchSchema = z
  .object({
    name: z.string().min(3).max(150).optional(),
    description: z.string().min(10).max(5000).optional(),
    highlights: z.array(z.string().min(1).max(200)).max(12).optional(),
    specifications: z.record(z.string(), z.string()).optional(),
    categoryId: z.string().optional(),
    brandId: z.string().nullable().optional(),
    images: z.array(z.object({ url: z.string().min(1).max(500) })).min(1).max(8).optional(),
    variants: z.array(variantInput).min(1).max(20).optional(),
    warrantyMonths: z.number().int().min(0).max(60).optional(),
    returnDays: z.number().int().min(0).max(90).optional(),
    codAvailable: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    for (const [i, variant] of (v.variants ?? []).entries()) {
      if (variant.mrp < variant.price) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "mrp"], message: "MRP must be greater than or equal to price" });
      }
    }
  });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSeller();
    const { id } = await params;
    const product = await db.product.findFirst({
      where: { id, sellerId: session.sellerId },
      include: productInclude,
    });
    if (!product) throw new ApiHttpError(404, "NOT_FOUND", "Product not found");
    return ok(toSellerProduct(product));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSeller();
    const { id } = await params;
    const body = await parseBody(req, patchSchema);

    const product = await db.product.findFirst({
      where: { id, sellerId: session.sellerId },
      include: { images: { orderBy: { sortOrder: "asc" } }, variants: { include: { inventory: true } } },
    });
    if (!product) throw new ApiHttpError(404, "NOT_FOUND", "Product not found");

    if (body.categoryId && body.categoryId !== product.categoryId) {
      const cat = await db.category.findUnique({ where: { id: body.categoryId } });
      if (!cat) throw new ApiHttpError(422, "INVALID_CATEGORY", "Selected category does not exist");
    }
    if (body.brandId) {
      const brand = await db.brand.findUnique({ where: { id: body.brandId } });
      if (!brand) throw new ApiHttpError(422, "INVALID_BRAND", "Selected brand does not exist");
    }

    let contentChanged = false;

    const updated = await db.$transaction(async (tx) => {
      const data: Prisma.ProductUpdateInput = {};

      if (body.name !== undefined && body.name !== product.name) {
        data.name = body.name;
        contentChanged = true;
      }
      if (body.description !== undefined && body.description !== product.description) {
        data.description = body.description;
        contentChanged = true;
      }
      if (body.highlights !== undefined) {
        data.highlights = toJson(body.highlights);
        if (toJson(body.highlights) !== product.highlights) contentChanged = true;
      }
      if (body.specifications !== undefined) {
        data.specifications = toJson(body.specifications);
        if (toJson(body.specifications) !== product.specifications) contentChanged = true;
      }
      if (body.categoryId) data.category = { connect: { id: body.categoryId } };
      if (body.brandId !== undefined) {
        data.brand = body.brandId ? { connect: { id: body.brandId } } : { disconnect: true };
      }
      if (body.warrantyMonths !== undefined) data.warrantyMonths = body.warrantyMonths;
      if (body.returnDays !== undefined) data.returnDays = body.returnDays;
      if (body.codAvailable !== undefined) data.codAvailable = body.codAvailable;

      // Images: full replace when provided.
      if (body.images) {
        const nextUrls = body.images.map((i) => i.url);
        const curUrls = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url);
        if (JSON.stringify(nextUrls) !== JSON.stringify(curUrls)) contentChanged = true;
        await tx.productImage.deleteMany({ where: { productId: product.id } });
        await tx.productImage.createMany({
          data: body.images.map((img, idx) => ({ productId: product.id, url: img.url, sortOrder: idx })),
        });
      }

      // Variants: full replace semantics — match by id, create new, delete removed.
      if (body.variants) {
        const existing = await tx.productVariant.findMany({
          where: { productId: product.id },
          include: { inventory: true, _count: { select: { orderItems: true } } },
        });
        const existingById = new Map(existing.map((v) => [v.id, v]));
        const incomingIds = new Set(body.variants.filter((v) => v.id).map((v) => v.id as string));

        // Removed variants: keep (deactivate) if they have order history, else delete.
        for (const ev of existing) {
          if (incomingIds.has(ev.id)) continue;
          contentChanged = true;
          if (ev._count.orderItems > 0) {
            await tx.productVariant.update({ where: { id: ev.id }, data: { isActive: false } });
          } else {
            await tx.productVariant.delete({ where: { id: ev.id } });
          }
        }

        for (const iv of body.variants) {
          const current = iv.id ? existingById.get(iv.id) : undefined;
          if (iv.id && !current) {
            throw new ApiHttpError(422, "INVALID_VARIANT", "A submitted variant does not belong to this product");
          }

          if (current) {
            if (current.sku !== iv.sku) {
              const clash = await tx.productVariant.findFirst({ where: { sku: iv.sku, id: { not: current.id } } });
              if (clash) throw new ApiHttpError(422, "SKU_TAKEN", `SKU "${iv.sku}" is already in use`);
            }
            if (
              current.price !== iv.price ||
              current.mrp !== iv.mrp ||
              current.name !== iv.name ||
              current.sku !== iv.sku
            ) {
              contentChanged = true;
            }
            await tx.productVariant.update({
              where: { id: current.id },
              data: {
                sku: iv.sku,
                name: iv.name,
                attributes: toJson(iv.attributes),
                mrp: iv.mrp,
                price: iv.price,
              },
            });
            const inv = current.inventory;
            if (inv && iv.onHand !== undefined && iv.onHand !== inv.onHand) {
              if (iv.onHand < inv.reserved) {
                throw new ApiHttpError(
                  422,
                  "STOCK_BELOW_RESERVED",
                  `Variant "${iv.sku}": stock cannot go below ${inv.reserved} reserved units`
                );
              }
              await adjustStock(tx, current.id, iv.onHand - inv.onHand);
            }
          } else {
            const clash = await tx.productVariant.findFirst({ where: { sku: iv.sku } });
            if (clash) throw new ApiHttpError(422, "SKU_TAKEN", `SKU "${iv.sku}" is already in use`);
            await tx.productVariant.create({
              data: {
                productId: product.id,
                sku: iv.sku,
                name: iv.name,
                attributes: toJson(iv.attributes),
                mrp: iv.mrp,
                price: iv.price,
                isActive: true,
                inventory: { create: { onHand: iv.onHand ?? 0, reserved: 0 } },
              },
            });
            contentChanged = true;
          }
        }
      }

      // Keep the seller's primary offer in sync with the first listed variant.
      const firstVariant = body.variants?.[0];
      if (firstVariant) {
        await tx.sellerOffer.upsert({
          where: { productId_sellerId: { productId: product.id, sellerId: session.sellerId } },
          update: { price: firstVariant.price, mrp: firstVariant.mrp },
          create: {
            productId: product.id,
            sellerId: session.sellerId,
            price: firstVariant.price,
            mrp: firstVariant.mrp,
            isPrimary: true,
            deliveryDays: 3,
          },
        });
      }

      // Archive / unarchive toggle.
      if (body.isActive === false) {
        data.status = "ARCHIVED";
      } else if (body.isActive === true && product.status === "ARCHIVED") {
        data.status = "PENDING"; // re-enter moderation
      }

      // Any listing-content edit sends the product back to moderation.
      if (contentChanged) {
        data.status = "PENDING";
        data.moderationNote = null;
      }

      if (Object.keys(data).length > 0) {
        await tx.product.update({ where: { id: product.id }, data });
      }
      return tx.product.findUnique({ where: { id: product.id }, include: productInclude });
    });

    await logAudit({
      actorId: session.id,
      actorRole: session.role,
      actorEmail: session.email,
      action: "PRODUCT_UPDATED",
      entityType: "product",
      entityId: id,
      meta: { contentChanged, status: updated?.status ?? product.status },
    });

    return ok(toSellerProduct(updated!));
  } catch (err) {
    return handleApiError(err);
  }
}
