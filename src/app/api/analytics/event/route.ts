// POST /api/analytics/event {type, payload?} — client-side analytics beacon
// (SEARCH, ZERO_RESULT_SEARCH, CHECKOUT_START, PRODUCT_VIEW, ...). Optional
// auth: events from anonymous visitors are kept with userId null. Failures
// are non-blocking by design — the UI fire-and-forgets these calls.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleApiError } from "@/lib/http";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { toJson } from "@/lib/json";

// Documented whitelist (see docs/CONTRACT.md) — anything else is rejected so
// the analytics table can't be polluted by arbitrary client strings.
const ALLOWED_TYPES = new Set([
  "SEARCH",
  "ADD_TO_CART",
  "CHECKOUT_START",
  "CHECKOUT_COMPLETE",
  "ZERO_RESULT_SEARCH",
]);

const eventSchema = z.object({
  type: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z_]+$/, "Event type must be UPPER_SNAKE_CASE")
    .refine((t) => ALLOWED_TYPES.has(t), "Unknown event type"),
  sessionId: z.string().min(1).max(64).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await parseBody(req, eventSchema);
    const session = await getSessionUser().catch(() => null);

    await db.analyticsEvent.create({
      data: {
        userId: session?.id ?? null,
        sessionId: body.sessionId ?? null,
        type: body.type,
        payload: body.payload ? toJson(body.payload) : null,
      },
    });

    // 204 No Content — the documented contract; no response body.
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
