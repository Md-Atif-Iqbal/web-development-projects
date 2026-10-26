// POST /api/seller/register — any authenticated user applies for a seller account.
// Creates Seller (PENDING) + SellerVerification, flips user role to SELLER.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, getClientIp, ApiHttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { rateLimit, RATE } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { toJson } from "@/lib/json";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/; // 15 chars
const PINCODE_RE = /^[1-9][0-9]{5}$/;
const PHONE_RE = /^(\+91[- ]?)?[6-9][0-9]{9}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Treat "", null and missing as undefined for optional fields. */
const opt = <T extends z.ZodType>(inner: T) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), inner.optional());

const bodySchema = z.object({
  businessName: z.string().min(3, "Business name must be at least 3 characters").max(120),
  gstin: opt(z.string().regex(GSTIN_RE, "Invalid GSTIN (15 characters)")),
  supportEmail: opt(z.string().email("Invalid support email")),
  supportPhone: opt(z.string().regex(PHONE_RE, "Invalid Indian phone number")),
  pickupLine1: z.string().min(5, "Pickup address line is too short").max(200),
  pickupCity: z.string().min(2).max(80),
  pickupState: z.string().min(2).max(80),
  pickupPincode: z.string().regex(PINCODE_RE, "Invalid pincode"),
  accountType: z.enum(["INDIVIDUAL", "BUSINESS"]),
  bankAccountName: z.string().min(2).max(120),
  bankAccountNumber: z.string().regex(/^[0-9]{6,20}$/, "Account number must be 6-20 digits"),
  bankIfsc: z.string().regex(IFSC_RE, "Invalid IFSC code"),
  documents: z
    .array(z.object({ type: z.string().min(2).max(40), number: z.string().min(2).max(60) }))
    .max(6)
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();

    const rl = rateLimit(`seller-register:${session.id}`, RATE.register.limit, RATE.register.windowMs);
    if (!rl.allowed) {
      throw new ApiHttpError(429, "RATE_LIMITED", `Too many attempts. Please retry in ${rl.retryAfterSec}s.`);
    }

    const body = await parseBody(req, bodySchema);

    const me = await db.user.findUnique({ where: { id: session.id }, include: { seller: true } });
    if (!me) throw new ApiHttpError(401, "UNAUTHENTICATED", "Please sign in to continue");
    if (me.seller) {
      throw new ApiHttpError(409, "ALREADY_REGISTERED", "You have already registered a seller account");
    }

    // Never store the raw bank account number — mask it (XXXXXXXX + last 4).
    const maskedAccount = `XXXXXXXX${body.bankAccountNumber.slice(-4)}`;

    const seller = await db.$transaction(async (tx) => {
      const created = await tx.seller.create({
        data: {
          userId: me.id,
          businessName: body.businessName,
          gstin: body.gstin ?? null,
          supportEmail: body.supportEmail ?? null,
          supportPhone: body.supportPhone ?? null,
          pickupLine1: body.pickupLine1,
          pickupCity: body.pickupCity,
          pickupState: body.pickupState,
          pickupPincode: body.pickupPincode,
          status: "PENDING",
          verification: {
            create: {
              accountType: body.accountType,
              bankAccountName: body.bankAccountName,
              bankAccountNumber: maskedAccount,
              bankIfsc: body.bankIfsc,
              documents: body.documents ? toJson(body.documents) : null,
              status: "PENDING",
            },
          },
        },
        include: { verification: true },
      });
      // Promote role to SELLER; keep any existing seller linkage untouched.
      await tx.user.update({ where: { id: me.id }, data: { role: "SELLER" } });
      return created;
    });

    await logAudit({
      actorId: me.id,
      actorRole: session.role,
      actorEmail: me.email,
      action: "SELLER_REGISTERED",
      entityType: "seller",
      entityId: seller.id,
      ip: getClientIp(req),
      meta: { businessName: body.businessName, accountType: body.accountType },
    });

    return ok(
      {
        seller: {
          id: seller.id,
          businessName: seller.businessName,
          status: seller.status,
          commissionBps: seller.commissionBps,
        },
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
