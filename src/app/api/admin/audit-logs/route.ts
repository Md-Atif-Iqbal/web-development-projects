// GET /api/admin/audit-logs — paginated audit trail (desc).
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, getPagination, paginated } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { parseJsonObject } from "@/lib/json";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const p = getPagination(sp, 25);
    const action = sp.get("action");

    const where: Prisma.AuditLogWhereInput = action ? { action: { contains: action } } : {};

    const [rows, total] = await Promise.all([
      db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: p.skip, take: p.take }),
      db.auditLog.count({ where }),
    ]);

    const items = rows.map((l) => ({
      id: l.id,
      actorId: l.actorId,
      actorRole: l.actorRole,
      actorEmail: l.actorEmail,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      meta: l.meta ? parseJsonObject<Record<string, unknown>>(l.meta, {}) : null,
      ip: l.ip,
      createdAt: l.createdAt.toISOString(),
    }));

    return ok(paginated(items, total, p));
  } catch (err) {
    return handleApiError(err);
  }
}
