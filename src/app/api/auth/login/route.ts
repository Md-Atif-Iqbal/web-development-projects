// POST /api/auth/login — verify credentials, set session cookie.
// 401 INVALID_CREDENTIALS on bad email/password; 403 ACCOUNT_SUSPENDED for
// suspended users. Rate-limited 10/min per IP.

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, handleApiError, parseBody, getClientIp } from "@/lib/http";
import { rateLimit, RATE } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { verifyPassword, createSession, type SessionUser } from "@/lib/auth";
import type { Me } from "@/lib/types";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(120),
  password: z.string().min(1, "Password is required").max(72),
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
    const rl = rateLimit(`login:${ip}`, RATE.login.limit, RATE.login.windowMs);
    if (!rl.allowed) {
      return fail(429, "RATE_LIMITED", `Too many attempts. Please try again in ${rl.retryAfterSec}s.`);
    }

    const body = await parseBody(req, loginSchema);
    const email = body.email.toLowerCase();

    const user = await db.user.findUnique({
      where: { email },
      include: { seller: { select: { id: true, status: true } } },
    });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return fail(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }
    if (user.status !== "ACTIVE") {
      return fail(403, "ACCOUNT_SUSPENDED", "Your account has been suspended. Contact support for help.");
    }

    await createSession(user.id, user.tokenVersion);

    return ok(
      toMe({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role as Me["role"],
        status: user.status,
        sellerId: user.seller?.id ?? null,
        sellerStatus: user.seller?.status ?? null,
      })
    );
  } catch (err) {
    return handleApiError(err);
  }
}
