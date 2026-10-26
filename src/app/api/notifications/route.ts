// GET /api/notifications — the signed-in user's latest 30 notifications + unread count.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import type { NotificationView } from "@/lib/types";

export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();

    const [rows, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      db.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    const items: NotificationView[] = rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));

    return ok({ items, unreadCount });
  } catch (err) {
    return handleApiError(err);
  }
}
