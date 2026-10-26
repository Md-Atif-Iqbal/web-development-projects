// POST /api/auth/register — create a customer account + session.
// Rate-limited 5/min per IP. Audit USER_REGISTER.

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, handleApiError, parseBody, getClientIp } from "@/lib/http";
import { rateLimit, RATE } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  hashPassword,
  createSession,
  type SessionUser,
} from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import type { Me } from "@/lib/types";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().trim().email("Enter a valid email address").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number")
    .optional()
    .or(z.literal("")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72)
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/\d/, "Password must contain at least one digit"),
});

function toMe(user: SessionUser): Me {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    sellerId: user.sellerId ?? null,
    sellerStatus: user.sellerStatus ?? null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(`register:${ip}`, RATE.register.limit, RATE.register.windowMs);
    if (!rl.allowed) {
      return fail(429, "RATE_LIMITED", `Too many attempts. Please try again in ${rl.retryAfterSec}s.`);
    }

    const body = await parseBody(req, registerSchema);
    const email = body.email.toLowerCase();

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return fail(409, "EMAIL_TAKEN", "An account with this email already exists. Please sign in.");
    }

    const passwordHash = await hashPassword(body.password);

    const user = await db.user.create({
      data: {
        name: body.name,
        email,
        phone: body.phone ? body.phone : null,
        passwordHash,
        role: ROLES.CUSTOMER,
        status: "ACTIVE",
        customerProfile: { create: {} },
        cart: { create: {} },
        wishlist: { create: {} },
      },
    });

    await createSession(user.id, user.tokenVersion);
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      actorEmail: user.email,
      action: "USER_REGISTER",
      entityType: "User",
      entityId: user.id,
      ip,
    });

    return ok(
      toMe({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role as Me["role"],
        status: user.status,
        sellerId: null,
        sellerStatus: null,
      }),
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
