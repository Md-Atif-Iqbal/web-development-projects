// Audit logging for privileged / money-affecting actions.
// Fire-and-forget: audit failures must never break the primary operation.

import { db } from "@/lib/db";
import { toJson } from "@/lib/json";

export type AuditInput = {
  actorId?: string | null;
  actorRole?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
};

export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        meta: input.meta ? toJson(input.meta) : null,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", err);
  }
}
