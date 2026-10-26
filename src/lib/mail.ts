// Email delivery for transactional mail (password reset).
//
// Providers, selected by environment:
//   - RESEND_API_KEY set  → Resend HTTP API (production-ready).
//   - otherwise           → "sandbox" console delivery in NON-production only:
//                           the rendered email is written to the server log
//                           under a clear SANDBOX MAIL banner. This is a mock
//                           mail service for development — it must NEVER be
//                           active in production.
//
// Honesty rule: sendMail never pretends an email was sent. Callers receive
// { delivered, provider } and must surface failures instead of claiming
// success. Nothing sensitive (tokens, passwords) is logged by this module
// in production — the sandbox console delivery is dev-only.

import "server-only";

export type MailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type MailResult = {
  delivered: boolean;
  provider: "resend" | "sandbox-console";
  error?: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isMailProviderConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** True when the sandbox console delivery may be used (dev/test only). */
export function isSandboxMailAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "ShopEase <onboarding@resend.dev>";

  if (apiKey) {
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        // Log the failure WITHOUT message content (no tokens in logs).
        console.error(`[mail] Resend delivery failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
        return { delivered: false, provider: "resend", error: `HTTP ${res.status}` };
      }
      return { delivered: true, provider: "resend" };
    } catch (err) {
      console.error("[mail] Resend delivery error:", (err as Error).message);
      return { delivered: false, provider: "resend", error: "network_error" };
    }
  }

  if (isSandboxMailAllowed()) {
    // Mock mail service for development: "deliver" to the server log so the
    // full flow is testable without real credentials. Dev-only by design.
    console.info(
      [
        "",
        "────────────────── 📬 SANDBOX MAIL DELIVERY (no email provider configured) ──────────────────",
        `To:      ${input.to}`,
        `Subject: ${input.subject}`,
        "─".repeat(94),
        input.text,
        "───────────────────────────────────────────── end of sandbox email ──────────────────────────",
      ].join("\n")
    );
    return { delivered: true, provider: "sandbox-console" };
  }

  console.error(
    "[mail] No email provider configured (set RESEND_API_KEY) — transactional email NOT delivered."
  );
  return { delivered: false, provider: "sandbox-console", error: "mail_not_configured" };
}

// ── Password reset email (template per ShopEase copy guidelines) ──

export type PasswordResetEmailInput = {
  name: string;
  resetUrl: string;
  expiryMinutes: number;
};

export function buildPasswordResetEmail(input: PasswordResetEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = input.name.trim().split(/\s+/)[0] || "there";
  const safeUrl = escapeHtml(input.resetUrl);
  const subject = "Reset Your ShopEase Password";

  const text = [
    `Hello ${firstName},`,
    "",
    "We received a request to reset the password for your ShopEase account.",
    "",
    "Click the link below to create a new password:",
    input.resetUrl,
    "",
    `For your security, this link will expire in ${input.expiryMinutes} minutes and can only be used once.`,
    "",
    "If you did not request this change, you can safely ignore this email. Your password will remain unchanged.",
    "",
    "Thank you,",
    "Team ShopEase",
  ].join("\n");

  // Brand header: use the hosted ShopEase icon when a public base URL is
  // configured (email clients cannot render inline SVG); otherwise fall back
  // to a styled text badge so sandbox emails never reference dead hosts.
  const logoUrl = process.env.APP_BASE_URL
    ? `${String(process.env.APP_BASE_URL).replace(/\/+$/, "")}/brand/icon-192.png`
    : null;
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" width="40" height="40" alt="ShopEase" style="display:inline-block;vertical-align:middle;border:0;border-radius:10px;">`
    : `<span style="display:inline-block;background:#ffffff;color:#e85a24;font-weight:bold;font-size:20px;border-radius:10px;padding:6px 12px;vertical-align:middle;">S</span>`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f6f8;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#FF6B35,#e85a24);padding:24px 32px;">
                ${logoHtml}
                <span style="color:#ffffff;font-size:22px;font-weight:bold;padding-left:8px;vertical-align:middle;">ShopEase</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;color:#1c1917;">Hello ${escapeHtml(firstName)},</h1>
                <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#44403c;">
                  We received a request to reset the password for your ShopEase account.
                </p>
                <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#44403c;">
                  Click the button below to create a new password.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${safeUrl}" style="display:inline-block;background:#e85a24;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;">
                    Reset My Password
                  </a>
                </p>
                <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#78716c;">
                  Or copy this link into your browser:<br>
                  <a href="${safeUrl}" style="color:#e85a24;word-break:break-all;">${safeUrl}</a>
                </p>
                <p style="margin:16px 0 0;font-size:13px;line-height:20px;color:#78716c;">
                  For your security, this link will expire in ${input.expiryMinutes} minutes and can only be used once.
                </p>
                <hr style="border:none;border-top:1px solid #e7e5e4;margin:24px 0;">
                <p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#78716c;">
                  If you did not request this change, you can safely ignore this email. Your password will remain unchanged.
                </p>
                <p style="margin:0;font-size:13px;line-height:20px;color:#44403c;">
                  Thank you,<br>Team ShopEase
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#fafaf9;padding:16px 32px;font-size:11px;color:#a8a29e;text-align:center;">
                You are receiving this email because a password reset was requested for this address on ShopEase.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
