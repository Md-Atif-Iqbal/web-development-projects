// POST /api/newsletter/subscribe {email} — public newsletter signup used by
// the site footer. Idempotent: subscribing an existing (active) address is a
// success with alreadySubscribed=true; a previously unsubscribed address is
// re-activated. The UI must never claim success it didn't get — this endpoint
// returns exactly what happened.

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, handleApiError, fail, getClientIp } from "@/lib/http";
import { rateLimit, RATE } from "@/lib/rate-limit";
import { db } from "@/lib/db";

const subscribeSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .max(254, "Email is too long")
    .transform((v) => v.toLowerCase()),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(`newsletter:${ip}`, RATE.newsletter.limit, RATE.newsletter.windowMs);
    if (!rl.allowed) {
      return fail(429, "RATE_LIMITED", "Too many requests. Please try again in a minute.");
    }

    const body = await parseBody(req, subscribeSchema);

    const existing = await db.newsletterSubscriber.findUnique({ where: { email: body.email } });

    if (!existing) {
      await db.newsletterSubscriber.create({
        data: { email: body.email, source: "footer" },
      });
      return ok({ subscribed: true, alreadySubscribed: false }, 201);
    }

    if (!existing.isActive) {
      // Re-activate a previously unsubscribed address.
      await db.newsletterSubscriber.update({
        where: { email: body.email },
        data: { isActive: true },
      });
      return ok({ subscribed: true, alreadySubscribed: false }, 200);
    }

    return ok({ subscribed: true, alreadySubscribed: true }, 200);
  } catch (err) {
    return handleApiError(err);
  }
}
