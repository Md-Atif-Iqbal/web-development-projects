// POST /api/auth/logout — clear the session cookie.

import { handleApiError, ok } from "@/lib/http";
import { destroySession } from "@/lib/auth";

export async function POST() {
  try {
    await destroySession();
    return ok({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
