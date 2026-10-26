// GET  /api/addresses — the caller's addresses, default first (then newest).
// POST /api/addresses — create an address. First address is auto-default;
// setting isDefault unsets the previous default.

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, handleApiError, parseBody } from "@/lib/http";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { AddressView } from "@/lib/types";

const addressSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(120),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  line1: z.string().trim().min(1, "Address (house no, building, street) is required").max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1, "City is required").max(100),
  state: z.string().trim().min(1, "State is required").max(100),
  pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit pincode"),
  type: z.enum(["HOME", "WORK", "OTHER"]).default("HOME"),
  isDefault: z.boolean().optional(),
});

type AddressRow = {
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
};

function toView(a: AddressRow): AddressView {
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

export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    const addresses = await db.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return ok({ items: addresses.map(toView) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseBody(req, addressSchema);

    const existingCount = await db.address.count({ where: { userId: user.id } });
    const makeDefault = body.isDefault === true || existingCount === 0;

    const address = await db.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } });
      }
      return tx.address.create({
        data: {
          userId: user.id,
          fullName: body.fullName,
          phone: body.phone,
          line1: body.line1,
          line2: body.line2 ?? null,
          landmark: body.landmark ?? null,
          city: body.city,
          state: body.state,
          pincode: body.pincode,
          type: body.type,
          isDefault: makeDefault,
        },
      });
    });

    return ok({ item: toView(address) }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
