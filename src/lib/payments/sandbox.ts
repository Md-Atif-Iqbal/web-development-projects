// Sandbox payment adapter — clearly labelled development provider.
//
// This adapter implements the SAME interface a real gateway (e.g. Razorpay)
// would expose to this platform: create payment -> redirect customer ->
// receive signed webhook -> verify signature -> idempotently settle.
//
// IMPORTANT: `sandbox: true` is stamped on every Payment row and every UI
// surface shows a "SANDBOX MODE — no real money" banner. To go live, swap in
// a real provider adapter implementing the same functions; this file never
// pretends to be a real bank.

import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { ids } from "@/lib/ids";
import { convertReservations, releaseReservations } from "@/lib/inventory";
import { logAudit } from "@/lib/audit";

const WEBHOOK_SECRET =
  process.env.SANDBOX_WEBHOOK_SECRET || "shopkart-sandbox-webhook-dev-secret";

export const SANDBOX_PROVIDER = "SANDBOX";

export function signPayload(rawBody: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
}

export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = signPayload(rawBody);
  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

export function buildWebhookPayload(input: {
  event: "payment.captured" | "payment.failed";
  providerRef: string;
  amount: number;
  sessionId: string;
}): { raw: string; signature: string } {
  const raw = JSON.stringify(input);
  return { raw, signature: signPayload(raw) };
}

/**
 * Core settlement state machine. Idempotent: replaying the same webhook is safe.
 * Called ONLY from the webhook path (the sandbox "gateway" calls this after
 * producing a signed payload — same code path a real gateway hits).
 */
export async function processSandboxWebhook(
  rawBody: string,
  signature: string | null
): Promise<{ ok: boolean; code: string; message: string; duplicate?: boolean }> {
  const valid = verifySignature(rawBody, signature);
  if (!valid) {
    await logAudit({ action: "PAYMENT_WEBHOOK_REJECTED", entityType: "payment", meta: { reason: "bad_signature" } });
    return { ok: false, code: "BAD_SIGNATURE", message: "Webhook signature verification failed" };
  }

  let event: { event?: string; providerRef?: string; amount?: number; sessionId?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, code: "BAD_PAYLOAD", message: "Webhook payload is not valid JSON" };
  }
  if (!event.providerRef || !event.event) {
    return { ok: false, code: "BAD_PAYLOAD", message: "Missing required webhook fields" };
  }

  const payment = await db.payment.findUnique({
    where: { providerRef: event.providerRef },
    include: { order: true },
  });
  if (!payment) return { ok: false, code: "PAYMENT_NOT_FOUND", message: "Unknown payment reference" };

  // Log the webhook attempt (even for duplicates) — reconciliation trail
  await db.paymentEvent.create({
    data: {
      paymentId: payment.id,
      type: "WEBHOOK",
      payload: rawBody,
      signatureValid: true,
    },
  });

  const captured = event.event === "payment.captured";

  if (captured && payment.status === "PAID") return { ok: true, code: "DUPLICATE", message: "Payment already captured", duplicate: true };
  if (!captured && payment.status === "FAILED") return { ok: true, code: "DUPLICATE", message: "Payment already marked failed", duplicate: true };
  if (["REFUNDED", "PARTIALLY_REFUNDED", "CANCELLED"].includes(payment.status)) {
    return { ok: false, code: "INVALID_STATE", message: "Payment can no longer transition" };
  }

  if (captured) {
    if (typeof event.amount === "number" && event.amount !== payment.amount) {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", failureReason: "Amount mismatch between gateway and order" },
      });
      await logAudit({ action: "PAYMENT_AMOUNT_MISMATCH", entityType: "payment", entityId: payment.id, meta: { expected: payment.amount, received: event.amount } });
      return { ok: false, code: "AMOUNT_MISMATCH", message: "Captured amount does not match the order total" };
    }

    await db.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "PAID", updatedAt: new Date() } });
      if (payment.order.status === "PENDING_PAYMENT") {
        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            status: "CONFIRMED",
            paymentStatus: "PAID",
            confirmedAt: new Date(),
            statusHistory: appendHistory(payment.order.statusHistory, "CONFIRMED", "Payment verified via webhook"),
          },
        });
        await tx.paymentEvent.create({
          data: { paymentId: payment.id, type: "STATUS_CHANGE", payload: toJson({ from: "PENDING", to: "PAID" }) },
        });
      } else {
        await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: "PAID" } });
      }
      await convertReservations(tx, payment.orderId);
      // Lazily import to avoid circular deps at module init
      const { ensureFulfillmentsForOrder } = await import("@/lib/orders");
      await ensureFulfillmentsForOrder(tx, payment.orderId);
    });

    await db.analyticsEvent.create({
      data: { type: "PAYMENT_SUCCESS", userId: payment.order.userId, payload: toJson({ orderId: payment.orderId, amount: payment.amount, provider: "SANDBOX" }) },
    }).catch(() => undefined);
    await logAudit({ action: "PAYMENT_CAPTURED", entityType: "payment", entityId: payment.id, meta: { orderId: payment.orderId, providerRef: payment.providerRef } });
    return { ok: true, code: "CAPTURED", message: "Payment captured" };
  }

  // Failure path
  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: "Gateway reported failure", updatedAt: new Date() },
    });
    await tx.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: "FAILED", statusHistory: appendHistory(payment.order.statusHistory, "PAYMENT_FAILED", "Payment failed at gateway") },
    });
    // Free the reserved stock; a retry will re-reserve.
    await releaseReservations(tx, { orderId: payment.orderId });
  });
  await db.analyticsEvent.create({
    data: { type: "PAYMENT_FAILED", userId: payment.order.userId, payload: toJson({ orderId: payment.orderId, amount: payment.amount, provider: "SANDBOX" }) },
  }).catch(() => undefined);
  await logAudit({ action: "PAYMENT_FAILED", entityType: "payment", entityId: payment.id, meta: { orderId: payment.orderId } });
  return { ok: true, code: "FAILED", message: "Payment marked failed" };
}

/** Create the payment attempt for an order. COD orders are confirmed inline by the caller. */
export async function createSandboxPayment(orderId: string, method: string, amount: number) {
  const providerRef = ids.paymentRef();
  const payment = await db.payment.create({
    data: {
      orderId,
      provider: SANDBOX_PROVIDER,
      method,
      amount,
      status: "PENDING",
      providerRef,
      sandbox: true,
    },
  });
  await db.paymentEvent.create({
    data: { paymentId: payment.id, type: "CREATED", payload: toJson({ providerRef, method, amount }) },
  });
  return payment;
}

/** Mark a COD payment as collected on delivery. */
export async function markCodCollected(orderId: string): Promise<void> {
  await db.payment.updateMany({ where: { orderId, provider: "COD", status: "PENDING" }, data: { status: "PAID", updatedAt: new Date() } });
  await db.order.updateMany({ where: { id: orderId, paymentStatus: "PENDING" }, data: { paymentStatus: "PAID" } });
}

export function appendHistory(rawHistory: string, status: string, note?: string): string {
  let history: Array<{ status: string; at: string; note?: string }> = [];
  try {
    history = JSON.parse(rawHistory) ?? [];
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }
  history.push({ status, at: new Date().toISOString(), ...(note ? { note } : {}) });
  return JSON.stringify(history);
}
