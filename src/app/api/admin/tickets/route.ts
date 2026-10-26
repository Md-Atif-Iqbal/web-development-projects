// GET /api/admin/tickets — all support tickets with user info + messages.
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, getPagination, paginated } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import type { TicketView } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const p = getPagination(sp, 20);
    const status = sp.get("status")?.toUpperCase();

    const where: Prisma.SupportTicketWhereInput = status ? { status } : {};

    const [rows, total] = await Promise.all([
      db.supportTicket.findMany({
        where,
        include: { user: { select: { name: true, email: true } }, messages: { orderBy: { createdAt: "asc" } } },
        orderBy: { updatedAt: "desc" },
        skip: p.skip,
        take: p.take,
      }),
      db.supportTicket.count({ where }),
    ]);

    const items = rows.map<TicketView>((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      category: t.category,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      userName: t.user.name,
      userEmail: t.user.email,
      messages: t.messages.map((m) => ({
        id: m.id,
        authorRole: m.authorRole,
        authorName: m.authorName,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    }));

    return ok(paginated(items, total, p));
  } catch (err) {
    return handleApiError(err);
  }
}
