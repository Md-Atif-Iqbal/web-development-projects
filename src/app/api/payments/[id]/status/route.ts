// GET /api/payments/[id]/status — owner/admin polling endpoint for payment state.
import { NextRequest } from "next/server";
import { ok, handleApiError, ApiHttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/constants";
import type { PaymentView } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const payment = await db.payment.findUnique({
      where: { id },
      include: { order: { select: { id: true, status: true, orderNumber: true, userId: true } } },
    });
    if (!payment) throw new ApiHttpError(404, "NOT_FOUND", "Payment not found");
    if (payment.order.userId !== user.id && user.role !== ROLES.ADMIN) {
      throw new ApiHttpError(404, "NOT_FOUND", "Payment not found");
    }

    const view: PaymentView = {
      id: payment.id,
      provider: payment.provider,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      providerRef: payment.providerRef,
      sandbox: payment.sandbox,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt.toISOString(),
    };

    return ok({
      payment: view,
      order: { id: payment.order.id, status: payment.order.status, orderNumber: payment.order.orderNumber },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
