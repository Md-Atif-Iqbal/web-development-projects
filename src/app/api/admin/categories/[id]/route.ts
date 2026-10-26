// PATCH /api/admin/categories/[id] — rename / toggle active / reorder.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, ApiHttpError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(req, patchSchema);

    const existing = await db.category.findUnique({ where: { id } });
    if (!existing) throw new ApiHttpError(404, "NOT_FOUND", "Category not found");

    const category = await db.category.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
    });

    await logAudit({
      actorId: admin.id,
      actorRole: admin.role,
      actorEmail: admin.email,
      action: "CATEGORY_UPDATED",
      entityType: "category",
      entityId: id,
      meta: body,
    });

    return ok({ item: category });
  } catch (err) {
    return handleApiError(err);
  }
}
