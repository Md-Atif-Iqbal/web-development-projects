// POST /api/webhooks/payments/sandbox — signed provider webhook receiver.
// ALWAYS responds 200 { ok, code, message }, even on verification failure,
// so a real provider's retry logic would not storm a broken endpoint.
import { NextRequest } from "next/server";
import { ok } from "@/lib/http";
import { processSandboxWebhook } from "@/lib/payments/sandbox";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Strict per-IP rate limit; still answered with a 200 envelope.
  const rl = rateLimit(`webhook:${getClientIp(req)}`, 30, 60_000);
  if (!rl.allowed) {
    return ok({ ok: false, code: "RATE_LIMITED", message: `Too many webhook calls. Retry after ${rl.retryAfterSec}s` });
  }

  try {
    const raw = await req.text();
    const signature = req.headers.get("x-sk-signature");
    const result = await processSandboxWebhook(raw, signature);
    return ok({ ok: result.ok, code: result.code, message: result.message });
  } catch (err) {
    console.error("[webhook] sandbox payment webhook failed:", err);
    return ok({ ok: false, code: "PROCESSING_ERROR", message: "Webhook processing failed" });
  }
}
