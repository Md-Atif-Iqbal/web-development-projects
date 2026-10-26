// PATCH /api/admin/returns/[id] — refund pipeline: initiate / complete refund, or close the request.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { createRefundForReturn, completeRefund } from "@/lib/orders";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  action: z.enum(["initiate_refund", "complete_refund", "close"]),
  note: z.string().max(500).optional(),
});

function toHttpError(err: unknown): ApiHttpError {
  return new ApiHttpError(
    409,
    "REFUND_ERROR",
    err instanceof Error ? err.message : "Refund operation failed"
  );
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(req, bodySchema);
    const actor = { id: admin.id, role: admin.role, email: admin.email };

    const returnReq = await db.returnRequest.findUnique({ where: { id } });
    if (!returnReq) throw new ApiHttpError(404, "NOT_FOUND", "Return request not found");

    if (body.action === "initiate_refund") {
      let refund: { id: string; amount: number; status: string };
      try {
        refund = await createRefundForReturn(id, actor, { note: body.note });
      } catch (err) {
        throw toHttpError(err);
      }
      return ok({ ok: true, refund });
    }

    if (body.action === "complete_refund") {
      const withRefund = await db.returnRequest.findUnique({ where: { id }, include: { refund: true } });
      if (!withRefund?.refund) {
        throw new ApiHttpError(409, "REFUND_ERROR", "No refund has been initiated for this return yet");
      }
      try {
        await completeRefund(withRefund.refund.id, actor);
      } catch (err) {
        throw toHttpError(err);
      }
      return ok({ ok: true, status: "REFUND_COMPLETED" });
    }

    // close
    if (returnReq.status === "CLOSED") {
      throw new ApiHttpError(409, "INVALID_STATUS_TRANSITION", "Return request is already closed");
    }
    await db.returnRequest.update({
      where: { id },
      data: { status: "CLOSED", updatedAt: new Date(), ...(body.note !== undefined ? { decisionNote: body.note } : {}) },
    });
    await logAudit({
      actorId: admin.id,
      actorRole: admin.role,
      actorEmail: admin.email,
      action: "RETURN_CLOSED",
      entityType: "return",
      entityId: id,
      meta: { note: body.note ?? null },
    });
    return ok({ ok: true, status: "CLOSED" });
  } catch (err) {
    return handleApiError(err);
  }
}
