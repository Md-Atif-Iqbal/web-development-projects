// REST helpers: consistent success/error envelopes, zod body parsing,
// pagination, and client IP extraction. All API routes use these.

import { NextRequest, NextResponse } from "next/server";
import { ZodSchema } from "zod";
import { AuthError } from "@/lib/auth";

export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as object, { status });
}

export function fail(status: number, code: string, message: string, details?: unknown): NextResponse {
  const body: ApiErrorBody = { error: { code, message, ...(details !== undefined ? { details } : {}) } };
  return NextResponse.json(body, { status });
}

/** Thrown anywhere inside a route handler to produce a clean error response. */
export class ApiHttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiHttpError) return fail(err.status, err.code, err.message, err.details);
  if (err instanceof AuthError) return fail(err.status, err.code, err.message);
  // Zod 4 throws ZodError with .issues
  if (err && typeof err === "object" && "issues" in (err as object)) {
    const zerr = err as { issues: Array<{ path: (string | number)[]; message: string }> };
    return fail(422, "VALIDATION_ERROR", "Invalid request data",
      zerr.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  }
  console.error("[api] unhandled error:", err);
  return fail(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}

/** Parse + validate a JSON body. Throws 422 on invalid input. */
export async function parseBody<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiHttpError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  return schema.parse(raw);
}

export type Pagination = { page: number; pageSize: number; skip: number; take: number };

export function getPagination(searchParams: URLSearchParams, defaultSize = 12, maxSize = 50): Pagination {
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number(searchParams.get("pageSize")) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(items: T[], total: number, p: Pagination) {
  return {
    items,
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
