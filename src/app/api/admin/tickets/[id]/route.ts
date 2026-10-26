// PATCH /api/admin/tickets/[id] — change status and/or reply as ADMIN.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { notify } from "@/lib/orders";
import type { TicketView } from "@/lib/types";

const patchSchema = z
  .object({
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
    reply: z.string().min(1).max(2000).optional(),
  })
  .refine((v) => v.status !== undefined || v.reply !== undefined, {
    message: "Provide a status change and/or a reply",
    path: [],
  });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(req, patchSchema);

    const ticket = await db.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new ApiHttpError(404, "NOT_FOUND", "Ticket not found");

    await db.$transaction(async (tx) => {
      if (body.reply) {
        await tx.ticketMessage.create({
          data: { ticketId: id, authorRole: "ADMIN", authorName: admin.name, body: body.reply },
        });
        if (ticket.status === "OPEN" && !body.status) {
          await tx.supportTicket.update({ where: { id }, data: { status: "IN_PROGRESS" } });
        }
        await notify(tx, ticket.userId, "SYSTEM", `Support replied to ticket ${ticket.ticketNumber}`, body.reply.slice(0, 160));
      }
      if (body.status && body.status !== ticket.status) {
        await tx.supportTicket.update({ where: { id }, data: { status: body.status } });
      }
    });

    const updated = await db.supportTicket.findUnique({
      where: { id },
      include: { user: { select: { name: true, email: true } }, messages: { orderBy: { createdAt: "asc" } } },
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
          userName: updated.user.name,
          userEmail: updated.user.email,
          messages: updated.messages.map((m) => ({
            id: m.id,
            authorRole: m.authorRole,
            authorName: m.authorName,
            body: m.body,
            createdAt: m.createdAt.toISOString(),
          })),
        }
      : null;

    return ok({ item: view });
  } catch (err) {
    return handleApiError(err);
  }
}
