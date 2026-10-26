// PATCH  /api/addresses/[id] — update the caller's address (ownership checked;
// 404 when the address belongs to someone else). Setting isDefault unsets the
// previous default. DELETE — remove the caller's address ({ok: true}).

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, handleApiError, parseBody } from "@/lib/http";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { AddressView } from "@/lib/types";

const patchSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number").optional(),
  line1: z.string().trim().min(1).max(200).optional(),
  line2: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(100).optional(),
  state: z.string().trim().min(1).max(100).optional(),
  pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit pincode").optional(),
  type: z.enum(["HOME", "WORK", "OTHER"]).optional(),
  isDefault: z.boolean().optional(),
});

function toView(a: {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  type: string;
  isDefault: boolean;
}): AddressView {
  return {
    id: a.id,
    fullName: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    landmark: a.landmark,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    type: a.type,
    isDefault: a.isDefault,
  };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseBody(req, patchSchema);

    const address = await db.address.findUnique({ where: { id } });
    if (!address || address.userId !== user.id) {
      return fail(404, "NOT_FOUND", "Address not found");
    }

    const updated = await db.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await tx.address.updateMany({
          where: { userId: user.id, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      return tx.address.update({
        where: { id },
        data: {
          ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(body.line1 !== undefined ? { line1: body.line1 } : {}),
          ...(body.line2 !== undefined ? { line2: body.line2 } : {}),
          ...(body.landmark !== undefined ? { landmark: body.landmark } : {}),
          ...(body.city !== undefined ? { city: body.city } : {}),
          ...(body.state !== undefined ? { state: body.state } : {}),
          ...(body.pincode !== undefined ? { pincode: body.pincode } : {}),
          ...(body.type !== undefined ? { type: body.type } : {}),
          ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        },
      });
    });

    return ok({ item: toView(updated) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const address = await db.address.findUnique({ where: { id } });
    if (!address || address.userId !== user.id) {
      return fail(404, "NOT_FOUND", "Address not found");
    }

    await db.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });
      // If the default was removed, promote the most recent remaining address.
      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        });
        if (next) {
          await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
    });

    return ok({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
