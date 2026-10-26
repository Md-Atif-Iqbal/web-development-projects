// Server-side authentication & authorization.
// - Passwords hashed with bcrypt (bcryptjs).
// - Session = signed JWT (jose, HS256) stored in an httpOnly SameSite=Lax cookie.
// - Every protected API route MUST call requireUser()/requireRole() — never
//   trust role claims from the client body.

import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_DAYS, ROLES, type Role } from "@/lib/constants";

const secretString =
  process.env.SESSION_SECRET || "shopkart-dev-only-secret-change-me-in-production";
const secret = new TextEncoder().encode(secretString);

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  status: string;
  sellerId?: string | null;
  sellerStatus?: string | null;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string, tokenVersion = 0): Promise<void> {
  // `ver` embeds the user's tokenVersion so a password change (which bumps
  // it) immediately revokes every session issued before the change.
  const token = await new SignJWT({ sub: userId, ver: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("shopkart")
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(secret);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

async function loadSessionUser(userId: string, tokenVersion: number): Promise<SessionUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { seller: { select: { id: true, status: true } } },
  });
  if (!user || user.status !== "ACTIVE") return null;
  // Session revocation: JWTs issued before a password change carry an older
  // tokenVersion and are rejected here. Cookies from before this mechanism
  // shipped have no `ver` claim and are treated as version 0 (the default).
  if (user.tokenVersion !== tokenVersion) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role as Role,
    status: user.status,
    sellerId: user.seller?.id ?? null,
    sellerStatus: user.seller?.status ?? null,
  };
}

/** Returns the signed-in active user or null. Safe to call anywhere on the server. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret, { issuer: "shopkart" });
    if (!payload.sub) return null;
    const ver = typeof payload.ver === "number" ? payload.ver : 0;
    return await loadSessionUser(payload.sub, ver);
  } catch {
    return null;
  }
}

export class AuthError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 401) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Throws AuthError(401) when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("UNAUTHENTICATED", "Please sign in to continue", 401);
  return user;
}

/** Throws AuthError(401/403) unless the user has one of the given roles. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthError("FORBIDDEN", "You do not have permission to perform this action", 403);
  }
  return user;
}

/** Seller-only guard; additionally requires an APPROVED seller account when `approved` is true. */
export async function requireSeller(approved = true): Promise<SessionUser & { sellerId: string }> {
  const user = await requireRole(ROLES.SELLER);
  if (!user.sellerId) throw new AuthError("FORBIDDEN", "Seller account not found", 403);
  if (approved && user.sellerStatus !== "APPROVED") {
    throw new AuthError("FORBIDDEN", "Your seller account is not approved yet", 403);
  }
  return user as SessionUser & { sellerId: string };
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole(ROLES.ADMIN);
}
