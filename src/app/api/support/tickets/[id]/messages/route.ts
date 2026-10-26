// POST /api/support/tickets/[id]/messages — append a message (owner or admin).
// Admin replies flip OPEN tickets to IN_PROGRESS and notify the owner.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/orders";
import type { TicketView } from "@/lib/types";

const bodySchema = z.object({
  body: z.string().min(1, "Message cannot be empty").max(2000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = await parseBody(req, bodySchema);

    const ticket = await db.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new ApiHttpError(404, "NOT_FOUND", "Ticket not found");

    const isAdmin = user.role === "ADMIN";
    // Ownership check: only the ticket owner or an admin may post.
    if (!isAdmin && ticket.userId !== user.id) {
      throw new ApiHttpError(403, "FORBIDDEN", "You do not have access to this ticket");
    }

    await db.$transaction(async (tx) => {
      await tx.ticketMessage.create({
        data: {
          ticketId: id,
          authorRole: isAdmin ? "ADMIN" : "CUSTOMER",
          authorName: user.name,
          body: parsed.body,
        },
      });
      if (isAdmin && ticket.status === "OPEN") {
        await tx.supportTicket.update({ where: { id }, data: { status: "IN_PROGRESS" } });
      }
      if (isAdmin) {
        await notify(tx, ticket.userId, "SYSTEM", `New reply on ticket ${ticket.ticketNumber}`, parsed.body.slice(0, 160));
      }
    });

    const updated = await db.supportTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    const view: TicketView | null = updated
      ? {
          id: updated.id,
          ticketNumber: updated.ticketNumber,
          subject: updated.subject,
          category: updated.category,
          status: updated.status,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
          messages: updated.messages.map((m) => ({
            id: m.id,
            authorRole: m.authorRole,
            authorName: m.authorName,
            body: m.body,
            createdAt: m.createdAt.toISOString(),
          })),
        }
      : null;

    return ok({ item: view }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
