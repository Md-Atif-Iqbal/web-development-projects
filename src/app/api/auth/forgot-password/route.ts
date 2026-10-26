// POST /api/auth/forgot-password — issue a single-use, 30-minute password
// reset link for the given email and deliver it by email.
//
// Anti-enumeration: the response is IDENTICAL whether or not the account
// exists. Validation errors (bad format) and rate limits are the only other
// outcomes. In production, no token material ever appears in responses or
// logs; in the dev sandbox (no email provider configured) the reset link is
// additionally returned under `sandbox` — clearly labelled — so the flow is
// testable end-to-end without real mail credentials.
//
// Rate limits: 5 / 15 min per IP and 3 / 15 min per email address.

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, handleApiError, parseBody, getClientIp } from "@/lib/http";
import { rateLimit, RATE } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  generateResetToken,
  hashResetToken,
  resetExpiryFrom,
  buildResetUrl,
  RESET_TOKEN_TTL_MINUTES,
} from "@/lib/password-reset";
import { buildPasswordResetEmail, sendMail, isMailProviderConfigured, isSandboxMailAllowed } from "@/lib/mail";

const GENERIC_MESSAGE =
  "If an account exists with this email address, you will receive password reset instructions.";

const forgotSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(120, "Email is too long"),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // Rate limit BEFORE any parsing/work (per IP, then per email once known).
    const rlIp = rateLimit(`forgot-password:ip:${ip}`, RATE.forgotPassword.limit, RATE.forgotPassword.windowMs);
    if (!rlIp.allowed) {
      return fail(429, "RATE_LIMITED", `Too many requests. Please try again in ${Math.ceil(rlIp.retryAfterSec / 60)} minutes.`);
    }

    const body = await parseBody(req, forgotSchema);
    const email = body.email;

    const rlEmail = rateLimit(
      `forgot-password:email:${email}`,
      RATE.forgotPasswordEmail.limit,
      RATE.forgotPasswordEmail.windowMs
    );
    if (!rlEmail.allowed) {
      return fail(429, "RATE_LIMITED", `Too many requests for this email. Please try again in ${Math.ceil(rlEmail.retryAfterSec / 60)} minutes.`);
    }

    // Production must have real mail configuration; fail honestly instead of
    // pretending a link was sent. Same response for every address.
    const providerConfigured = isMailProviderConfigured();
    if (process.env.NODE_ENV === "production" && !providerConfigured) {
      return fail(503, "MAIL_NOT_CONFIGURED", "Email delivery is not configured. Please contact support.");
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, status: true },
    });

    let sandboxResetPath: string | undefined;

    if (user && user.status === "ACTIVE") {
      // New token invalidates all previous ones for this account.
      const rawToken = generateResetToken();
      await db.$transaction([
        db.passwordResetToken.deleteMany({ where: { userId: user.id } }),
        db.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashResetToken(rawToken),
            expiresAt: resetExpiryFrom(),
            ip,
          },
        }),
      ]);

      const resetUrl = buildResetUrl(rawToken);
      const emailContent = buildPasswordResetEmail({
        name: user.name,
        resetUrl,
        expiryMinutes: RESET_TOKEN_TTL_MINUTES,
      });

      const mailResult = await sendMail({ to: email, ...emailContent });
      if (!mailResult.delivered) {
        // Log operationally WITHOUT any link/token material.
        console.error(`[auth] password reset email could not be delivered (provider=${mailResult.provider}).`);
      }

      // Sandbox convenience: expose the link ONLY in non-production when the
      // console (mock) mail service was used. Clearly labelled, never in prod.
      if (isSandboxMailAllowed() && mailResult.provider === "sandbox-console") {
        try {
          const u = new URL(resetUrl);
          sandboxResetPath = `/?reset=${u.searchParams.get("reset") ?? ""}`;
        } catch {
          sandboxResetPath = undefined;
        }
      }

      // Security trail (admin-facing audit log only — no token material).
      await logAudit({
        actorId: user.id,
        actorEmail: user.email,
        action: "PASSWORD_RESET_REQUESTED",
        entityType: "User",
        entityId: user.id,
        ip,
      });
    }

    const response: {
      ok: boolean;
      message: string;
      sandbox?: { note: string; resetPath: string };
    } = { ok: true, message: GENERIC_MESSAGE };

    if (sandboxResetPath) {
      response.sandbox = {
        note: `SANDBOX: no email provider is configured, so the reset link was not actually emailed. Use this dev-only link (expires in ${RESET_TOKEN_TTL_MINUTES} minutes, single-use) to continue the flow.`,
        resetPath: sandboxResetPath,
      };
    }

    return ok(response);
  } catch (err) {
    return handleApiError(err);
  }
}
