// Password reset token utilities.
//
// Security model:
//   - Tokens are 32 cryptographically random bytes, base64url-encoded
//     (256 bits of entropy — brute-forcing is infeasible).
//   - Only a SHA-256 hash is persisted (PasswordResetToken.tokenHash). The
//     raw token lives exclusively inside the emailed reset link.
//   - Tokens are single-use (usedAt), expire after RESET_TOKEN_TTL_MINUTES,
//     and issuing a new token invalidates all earlier ones for that user.
//   - Reset links are built from the configured APP_BASE_URL — never from
//     the request Host header (which is attacker-controllable).

import "server-only";
import crypto from "crypto";

export const RESET_TOKEN_TTL_MINUTES = 30;

/** 256-bit cryptographically secure, URL-safe reset token. */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** SHA-256 hex hash of a reset token — the only value stored server-side. */
export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Absolute reset-link base URL from trusted configuration.
 * Throws in production when APP_BASE_URL is missing (fail closed) so a
 * security-sensitive link is never built from a guessed/untrusted origin.
 */
export function getResetBaseOrigin(): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_BASE_URL is not configured — cannot build password reset links");
  }
  return "http://localhost:3000";
}

export function buildResetUrl(token: string): string {
  return `${getResetBaseOrigin()}/?reset=${encodeURIComponent(token)}`;
}

export function resetExpiryFrom(now = new Date()): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
}
