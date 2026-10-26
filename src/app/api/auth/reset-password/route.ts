// POST /api/auth/reset-password — consume a single-use reset token and set a
// new password.
//
// Security:
//   - The supplied token is SHA-256 hashed and matched against
//     PasswordResetToken.tokenHash (raw tokens are never stored).
//   - Expired, already-used, or unknown tokens all return the SAME generic
//     400 TOKEN_INVALID response (no oracle for token probing).
//   - One transaction: bump user.tokenVersion (revokes every existing
//     session), mark the token used, and delete any other outstanding
//     tokens for the user — preventing replay and inconsistent state.
//   - Passwords are hashed with bcrypt (same scheme as registration);
//     plaintext never touches the database or logs.

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, handleApiError, parseBody, getClientIp } from "@/lib/http";
import { rateLimit, RATE } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { hashResetToken } from "@/lib/password-reset";
import { logAudit } from "@/lib/audit";

const resetSchema = z.object({
  token: z.string().min(20, "Invalid reset link").max(200, "Invalid reset link"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long")
    .regex(/[a-zA-Z]/, "Password must include a letter")
    .regex(/\d/, "Password must include a digit"),
});

const GENERIC_TOKEN_ERROR =
  "This reset link is invalid or has expired. Please request a new password reset link.";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(`reset-password:ip:${ip}`, RATE.passwordReset.limit, RATE.passwordReset.windowMs);
    if (!rl.allowed) {
      return fail(429, "RATE_LIMITED", `Too many attempts. Please try again in ${Math.ceil(rl.retryAfterSec / 60)} minutes.`);
    }

    const body = await parseBody(req, resetSchema);

    // bcrypt outside the transaction (slow KDF would hold the DB lock).
    const passwordHash = await hashPassword(body.newPassword);
    const tokenHash = hashResetToken(body.token);
    const now = new Date();

    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { id: true, status: true } },
      },
    });

    const isValid =
      record !== null &&
      record.usedAt === null &&
      record.expiresAt.getTime() > now.getTime() &&
      record.user !== null &&
      record.user.status === "ACTIVE";

    if (!isValid) {
      return fail(400, "TOKEN_INVALID", GENERIC_TOKEN_ERROR);
    }

    const updatedUser = await db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 }, // revokes all existing sessions
        },
        select: { id: true, email: true, tokenVersion: true },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      });
      // Invalidate any other outstanding tokens for this user.
      await tx.passwordResetToken.deleteMany({
        where: { userId: record.userId, id: { not: record.id } },
      });
      return user;
    });

    // Fire-and-forget user touchpoints (must never break the response).
    void db.notification
      .create({
        data: {
          userId: updatedUser.id,
          type: "SYSTEM",
          title: "Password changed",
          body: "Your ShopEase password was changed successfully. If this wasn't you, contact support immediately.",
        },
      })
      .catch(() => undefined);

    await logAudit({
      actorId: updatedUser.id,
      actorEmail: updatedUser.email,
      action: "PASSWORD_RESET_COMPLETED",
      entityType: "User",
      entityId: updatedUser.id,
      ip,
    });

    return ok({
      ok: true,
      message: "Your password has been reset successfully. You can now sign in with your new password.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
