// Live verification of the password-reset flow against the running dev
// server. Exercises all 13 acceptance scenarios end-to-end (uses the
// sandbox console mail service via the API's dev-only `sandbox` field).
// Scratch verification script — not part of the app source tree.

const BASE = "http://localhost:3000";
const TEST_EMAIL = "pwreset-test@example.com";
const OLD_PASSWORD = "OldPass123";
const NEW_PASSWORD = "NewSecure123";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${name} ${detail}`);
  }
}

type Res = { status: number; body: any; cookies: string[] };

async function call(path: string, init?: RequestInit, cookie?: string): Promise<Res> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = text; }
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, body, cookies: setCookies };
}

function sessionCookieFrom(res: Res): string {
  const c = res.cookies.find((c) => c.startsWith("sk_session="));
  return c ? c.split(";")[0] : "";
}

async function main() {
  console.log("── Setup: throwaway user ──");
  const reg = await call("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Password Reset Test", email: TEST_EMAIL, password: OLD_PASSWORD }),
  });
  check("throwaway user registered (or already exists)", reg.status === 201 || reg.status === 409, `got ${reg.status}`);

  const loginOld = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL, password: OLD_PASSWORD }),
  });
  const sessionA = sessionCookieFrom(loginOld);
  check("login with OLD password works (pre-reset)", loginOld.status === 200 && !!sessionA);

  console.log("── Scenario 1: registered email requests reset ──");
  const r1 = await call("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL }),
  });
  check("returns 200", r1.status === 200);
  check("generic message present", typeof r1.body?.message === "string" && r1.body.message.includes("If an account exists"));
  const tokenA: string | undefined = r1.body?.sandbox?.resetPath?.split("reset=")[1];
  check("sandbox reset link issued (dev-only)", Boolean(tokenA));

  console.log("── Scenario 2: unregistered email gets identical response ──");
  const r2 = await call("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: "nobody-nowhere@example.com" }),
  });
  check("returns 200", r2.status === 200);
  check("identical generic message (no enumeration)", r2.body?.message === r1.body?.message);
  check("no sandbox link for unregistered email", r2.body?.sandbox === undefined);

  console.log("── Scenario 3: invalid email format rejected ──");
  const r3 = await call("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: "not-an-email" }),
  });
  check("returns 422 VALIDATION_ERROR", r3.status === 422 && r3.body?.error?.code === "VALIDATION_ERROR");

  console.log("── New request invalidates previous token ──");
  const r4 = await call("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL }),
  });
  const tokenB: string | undefined = r4.body?.sandbox?.resetPath?.split("reset=")[1];
  check("second link issued (token B)", Boolean(tokenB) && tokenB !== tokenA);

  console.log("── Scenario 6: expired token rejected ──");
  const { PrismaClient } = await import("@prisma/client");
  const crypto = await import("crypto");
  const db = new PrismaClient();
  const expiredRaw = "expired-token-aaaaaaaaaaaaaaaaaaaa";
  const expiredHash = crypto.createHash("sha256").update(expiredRaw).digest("hex");
  const expiredUser = await db.user.findUnique({ where: { email: TEST_EMAIL } });
  await db.passwordResetToken.create({
    data: {
      userId: expiredUser!.id,
      tokenHash: expiredHash,
      expiresAt: new Date(Date.now() - 60_000), // 1 min ago
    },
  });
  const r5 = await call("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: expiredRaw, newPassword: NEW_PASSWORD }),
  });
  check("expired token → 400 TOKEN_INVALID", r5.status === 400 && r5.body?.error?.code === "TOKEN_INVALID");
  // Remove ONLY the expired row — token B (issued later by the API) must survive.
  await db.passwordResetToken.delete({ where: { tokenHash: expiredHash } });
  await db.$disconnect();

  console.log("── Scenario 5: invalid (random) token rejected ──");
  const r6 = await call("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: "totally-bogus-token-value-1234567890", newPassword: NEW_PASSWORD }),
  });
  check("random token → 400 TOKEN_INVALID", r6.status === 400 && r6.body?.error?.code === "TOKEN_INVALID");
  check("same generic error as expired (no oracle)", r6.body?.error?.message === r5.body?.error?.message);

  console.log("── Previous token (A) rejected after newer one issued ──");
  const r7 = await call("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: tokenA, newPassword: NEW_PASSWORD }),
  });
  check("old token A → 400 TOKEN_INVALID", r7.status === 400 && r7.body?.error?.code === "TOKEN_INVALID");

  console.log("── Scenario 9 + 7: valid reset succeeds, replay rejected ──");
  const r8 = await call("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: tokenB, newPassword: NEW_PASSWORD }),
  });
  check("valid token → 200", r8.status === 200 && r8.body?.ok === true);

  const r9 = await call("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: tokenB, newPassword: "AnotherPass123" }),
  });
  check("reused token → 400 TOKEN_INVALID", r9.status === 400 && r9.body?.error?.code === "TOKEN_INVALID");

  console.log("── Scenario 10: login with NEW password ──");
  const r10 = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL, password: NEW_PASSWORD }),
  });
  check("new password accepted", r10.status === 200);

  console.log("── Scenario 11: OLD password no longer works ──");
  const r11 = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL, password: OLD_PASSWORD }),
  });
  check("old password → 401 INVALID_CREDENTIALS", r11.status === 401 && r11.body?.error?.code === "INVALID_CREDENTIALS");

  console.log("── Session revocation: pre-reset session invalidated ──");
  const meOld = await call("/api/auth/me", {}, sessionA);
  check("old session cookie no longer authenticated", meOld.body?.user === null || meOld.status === 401, JSON.stringify(meOld.body).slice(0, 80));

  console.log("── Scenario 12: forgot-password rate limited ──");
  let got429 = false;
  for (let i = 0; i < 6; i++) {
    const rr = await call("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: `burst${i}@example.com` }),
    });
    if (rr.status === 429) { got429 = true; console.log(`    (request ${i + 1} of burst → 429)`); break; }
  }
  check("repeated requests hit 429 RATE_LIMITED", got429);

  console.log("── Scenario 13: existing login still operational ──");
  const r12 = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "riya@example.com", password: "Customer@123" }),
  });
  check("riya can still sign in", r12.status === 200);

  console.log("── Cleanup: remove throwaway user ──");
  const { PrismaClient: P2 } = await import("@prisma/client");
  const db2 = new P2();
  await db2.user.delete({ where: { email: TEST_EMAIL } });
  const gone = await db2.user.findUnique({ where: { email: TEST_EMAIL } });
  check("throwaway user removed (demo data pristine)", gone === null);
  await db2.$disconnect();

  console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("verification crashed:", e);
  process.exit(1);
});
