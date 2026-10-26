// /api/admin/coupons — GET all · POST create (PERCENT 1-90 | FLAT paise > 0).
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const createSchema = z
  .object({
    code: z
      .string()
      .min(3)
      .max(24)
      .regex(/^[A-Za-z0-9_-]+$/, "Code may only contain letters, numbers, - and _")
      .transform((s) => s.toUpperCase()),
    description: z.string().min(3).max(200),
    type: z.enum(["PERCENT", "FLAT"]),
    value: z.number().int(),
    minOrderValue: z.number().int().min(0).optional(),
    maxDiscount: z.number().int().positive().nullable().optional(),
    usageLimit: z.number().int().positive().nullable().optional(),
    perUserLimit: z.number().int().positive().optional(),
    validFrom: z.string().min(4),
    validTo: z.string().min(4),
  })
  .superRefine((v, ctx) => {
    if (v.type === "PERCENT" && (v.value < 1 || v.value > 90)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "PERCENT value must be between 1 and 90" });
    }
    if (v.type === "FLAT" && v.value <= 0) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "FLAT value must be a positive amount in paise" });
    }
    const from = new Date(v.validFrom);
    const to = new Date(v.validTo);
    if (Number.isNaN(from.getTime())) {
      ctx.addIssue({ code: "custom", path: ["validFrom"], message: "Invalid date" });
    }
    if (Number.isNaN(to.getTime())) {
      ctx.addIssue({ code: "custom", path: ["validTo"], message: "Invalid date" });
    }
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to <= from) {
      ctx.addIssue({ code: "custom", path: ["validTo"], message: "validTo must be after validFrom" });
    }
  });

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const coupons = await db.coupon.findMany({ orderBy: { code: "asc" } });
    return ok({ items: coupons });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await parseBody(req, createSchema);

    if (await db.coupon.findUnique({ where: { code: body.code } })) {
      throw new ApiHttpError(409, "COUPON_EXISTS", `Coupon code "${body.code}" already exists`);
    }

    const coupon = await db.coupon.create({
      data: {
        code: body.code,
        description: body.description,
        type: body.type,
        value: body.value,
        minOrderValue: body.minOrderValue ?? 0,
        maxDiscount: body.maxDiscount ?? null,
        usageLimit: body.usageLimit ?? null,
        perUserLimit: body.perUserLimit ?? 1,
        validFrom: new Date(body.validFrom),
        validTo: new Date(body.validTo),
        isActive: true,
      },
    });

    await logAudit({
      actorId: admin.id,
      actorRole: admin.role,
      actorEmail: admin.email,
      action: "COUPON_CREATED",
      entityType: "coupon",
      entityId: coupon.id,
      meta: { code: coupon.code, type: coupon.type, value: coupon.value },
    });

    return ok({ item: coupon }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
