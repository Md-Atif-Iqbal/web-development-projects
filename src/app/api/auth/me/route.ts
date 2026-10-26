// GET /api/auth/me — current session user. Always 200; `user: null` when
// signed out (frontend uses this to hydrate auth state).

import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/http";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import type { Me } from "@/lib/types";

function toMe(user: SessionUser): Me {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    sellerId: user.sellerId ?? null,
    sellerStatus: user.sellerStatus ?? null,
  };
}

export async function GET(_req: NextRequest) {
  try {
    const user = await getSessionUser();
    return ok({ user: user ? toMe(user) : null });
  } catch (err) {
    return handleApiError(err);
  }
}
