// PATCH /api/seller/returns/[id] — seller decisions on a return request
// (review / approve / reject / schedule_pickup / picked_up / inspection / close).
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireSeller } from "@/lib/auth";
import { canTransition, RETURN_STATUS_FLOW } from "@/lib/constants";
import { notify } from "@/lib/orders";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  action: z.enum(["review", "approve", "reject", "schedule_pickup", "picked_up", "inspection", "close"]),
  note: z.string().max(500).optional(),
});

const ACTION_TARGET: Record<string, string> = {
  review: "UNDER_REVIEW",
  approve: "APPROVED",
  reject: "REJECTED",
  schedule_pickup: "PICKUP_SCHEDULED",
  picked_up: "PICKED_UP",
  inspection: "INSPECTION_PENDING",
  close: "CLOSED",
};

const ACTION_AUDIT: Record<string, string> = {
  review: "RETURN_REVIEWED",
  approve: "RETURN_APPROVED",
  reject: "RETURN_REJECTED",
  schedule_pickup: "RETURN_PICKUP_SCHEDULED",
  picked_up: "RETURN_PICKED_UP",
  inspection: "RETURN_INSPECTION_PENDING",
  close: "RETURN_CLOSED",
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSeller();
    const { id } = await params;
    const body = await parseBody(req, bodySchema);

    const returnReq = await db.returnRequest.findUnique({
      where: { id },
      include: { items: { include: { orderItem: { select: { sellerId: true } } } } },
    });
    // Data isolation: seller must have at least one own item on this request.
    if (!returnReq || !returnReq.items.some((ri) => ri.orderItem.sellerId === session.sellerId)) {
      throw new ApiHttpError(404, "NOT_FOUND", "Return request not found");
    }

    const target = ACTION_TARGET[body.action];
    if (!canTransition(RETURN_STATUS_FLOW, returnReq.status, target)) {
      throw new ApiHttpError(
        409,
        "INVALID_STATUS_TRANSITION",
        `Cannot ${body.action.replace("_", " ")} a return in status ${returnReq.status}`
      );
    }

    const ownItems = returnReq.items.filter((ri) => ri.orderItem.sellerId === session.sellerId);

    await db.$transaction(async (tx) => {
      await tx.returnRequest.update({
        where: { id },
        data: {
          status: target,
          updatedAt: new Date(),
          ...(body.note !== undefined ? { decisionNote: body.note } : {}),
        },
      });

      if (body.action === "approve") {
        for (const ri of ownItems) {
          await tx.returnItem.update({ where: { id: ri.id }, data: { approvedQty: ri.qty } });
        }
        await notify(
          tx,
          returnReq.userId,
          "RETURN",
          `Return ${returnReq.rmaNumber} approved`,
          "Your return has been approved. Pickup will be scheduled soon."
        );
      }

      if (body.action === "reject") {
        // Items go back to ACTIVE so the customer keeps them.
        await tx.orderItem.updateMany({
          where: { id: { in: ownItems.map((ri) => ri.orderItemId) }, status: "RETURN_REQUESTED" },
          data: { status: "ACTIVE" },
        });
        await notify(
          tx,
          returnReq.userId,
          "RETURN",
          `Return ${returnReq.rmaNumber} rejected`,
          body.note ?? "The seller rejected this return request."
        );
      }
    });

    await logAudit({
      actorId: session.id,
      actorRole: session.role,
      actorEmail: session.email,
      action: ACTION_AUDIT[body.action],
      entityType: "return",
      entityId: id,
      meta: { from: returnReq.status, to: target, note: body.note ?? null },
    });

    return ok({ ok: true, id, status: target });
  } catch (err) {
    return handleApiError(err);
  }
}
