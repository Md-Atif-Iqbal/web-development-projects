// POST /api/notifications/read — mark specific ids (or all unread) as read.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth";

const bodySchema = z.object({
  ids: z.array(z.string()).max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseBody(req, bodySchema);

    const data = { readAt: new Date() };
    if (body.ids && body.ids.length > 0) {
      await db.notification.updateMany({
        where: { userId: user.id, id: { in: body.ids }, readAt: null },
        data,
      });
    } else {
      await db.notification.updateMany({
        where: { userId: user.id, readAt: null },
        data,
      });
    }

    return ok({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
