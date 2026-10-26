// POST /api/payments/[id]/sandbox-pay — SANDBOX gateway simulation for the
// order owner. Builds a signed webhook payload and pushes it through the SAME
// verification/settlement path as a real webhook (processSandboxWebhook).
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { buildWebhookPayload, processSandboxWebhook } from "@/lib/payments/sandbox";
import { rateLimit, RATE } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import type { PaymentView } from "@/lib/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  outcome: z.enum(["success", "failure"]),
});

function toPaymentView(p: {
  id: string;
  provider: string;
  method: string;
  amount: number;
  status: string;
  providerRef: string | null;
  sandbox: boolean;
  failureReason: string | null;
  createdAt: Date;
}): PaymentView {
  return {
    id: p.id,
    provider: p.provider,
    method: p.method,
    amount: p.amount,
    status: p.status,
    providerRef: p.providerRef,
    sandbox: p.sandbox,
    failureReason: p.failureReason,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const rl = rateLimit(`payaction:${user.id}`, RATE.paymentAction.limit, RATE.paymentAction.windowMs);
    if (!rl.allowed) {
      throw new ApiHttpError(429, "RATE_LIMITED", `Too many payment actions. Try again in ${rl.retryAfterSec}s.`);
    }

    const body = await parseBody(req, bodySchema);

    const payment = await db.payment.findUnique({
      where: { id },
      include: { order: { select: { id: true, status: true, orderNumber: true, paymentStatus: true, userId: true } } },
    });
    if (!payment) throw new ApiHttpError(404, "NOT_FOUND", "Payment not found");
    if (payment.order.userId !== user.id) {
      // Owner only — admins use admin routes.
      throw new ApiHttpError(404, "NOT_FOUND", "Payment not found");
    }
    if (payment.provider !== "SANDBOX" || payment.status !== "PENDING") {
      throw new ApiHttpError(409, "PAYMENT_NOT_PENDING", "Only pending sandbox payments can be processed");
    }

    // Produce the signed payload exactly like the (sandbox) gateway would.
    const payload = buildWebhookPayload({
      event: body.outcome === "success" ? "payment.captured" : "payment.failed",
      providerRef: payment.providerRef ?? "",
      amount: payment.amount,
      sessionId: payment.id,
    });
    const result = await processSandboxWebhook(payload.raw, payload.signature);

    if (!result.ok) {
      const status = result.code === "AMOUNT_MISMATCH" ? 402 : 409;
      throw new ApiHttpError(status, result.code, result.message);
    }

    // Coupon redemption for prepaid orders happens on successful capture
    // (the settlement lib intentionally does not handle coupons).
    if (body.outcome === "success" && result.code === "CAPTURED") {
      const order = await db.order.findUnique({
        where: { id: payment.orderId },
        select: { id: true, userId: true, couponId: true, couponDiscount: true },
      });
      if (order?.couponId) {
        const already = await db.couponRedemption.findFirst({
          where: { couponId: order.couponId, userId: order.userId, orderId: order.id },
        });
        if (!already) {
          await db.$transaction([
            db.couponRedemption.create({
              data: { couponId: order.couponId, userId: order.userId, orderId: order.id, discountAmount: order.couponDiscount },
            }),
            db.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } }),
          ]);
        }
      }
    }

    const refreshed = await db.payment.findUnique({
      where: { id: payment.id },
      include: { order: { select: { id: true, status: true, orderNumber: true, paymentStatus: true } } },
    });
    if (!refreshed) throw new ApiHttpError(404, "NOT_FOUND", "Payment not found");

    return ok({
      payment: toPaymentView(refreshed),
      order: {
        id: refreshed.order.id,
        status: refreshed.order.status,
        orderNumber: refreshed.order.orderNumber,
        paymentStatus: refreshed.order.paymentStatus,
      },
      webhook: { code: result.code, message: result.message, duplicate: result.duplicate ?? false },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
