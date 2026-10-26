// /api/support/tickets — GET own tickets · POST create a ticket (rate-limited).
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { ids } from "@/lib/ids";
import { logAudit } from "@/lib/audit";
import { rateLimit, RATE } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/http";
import type { TicketView } from "@/lib/types";

const createSchema = z.object({
  subject: z.string().min(5, "Subject is too short").max(150),
  category: z.enum(["ORDER", "PAYMENT", "RETURN", "ACCOUNT", "SELLER", "OTHER"]),
  message: z.string().min(10, "Message is too short").max(4000),
  orderId: z.string().optional(),
});

async function toTicketView(ticketId: string): Promise<TicketView | null> {
  const t = await db.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!t) return null;
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    category: t.category,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    messages: t.messages.map((m) => ({
      id: m.id,
      authorRole: m.authorRole,
      authorName: m.authorName,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    const tickets = await db.supportTicket.findMany({
      where: { userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });

    const items: TicketView[] = tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      category: t.category,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      messages: t.messages.map((m) => ({
        id: m.id,
        authorRole: m.authorRole,
        authorName: m.authorName,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    }));

    return ok({ items });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const rl = rateLimit(`support-ticket:${user.id}`, 5, 60_000);
    if (!rl.allowed) {
      throw new ApiHttpError(429, "RATE_LIMITED", `Too many tickets. Please retry in ${rl.retryAfterSec}s.`);
    }

    const body = await parseBody(req, createSchema);

    if (body.orderId) {
      const order = await db.order.findUnique({ where: { id: body.orderId }, select: { userId: true } });
      if (!order || order.userId !== user.id) {
        throw new ApiHttpError(422, "INVALID_ORDER", "Order does not belong to you");
      }
    }

    const ticket = await db.supportTicket.create({
      data: {
        ticketNumber: ids.ticketNumber(),
        userId: user.id,
        orderId: body.orderId ?? null,
        subject: body.subject,
        category: body.category,
        status: "OPEN",
        messages: {
          create: { authorRole: "CUSTOMER", authorName: user.name, body: body.message },
        },
      },
    });

    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      actorEmail: user.email,
      action: "TICKET_CREATED",
      entityType: "ticket",
      entityId: ticket.id,
      ip: getClientIp(req),
      meta: { ticketNumber: ticket.ticketNumber, category: ticket.category },
    });

    return ok({ item: await toTicketView(ticket.id) }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
