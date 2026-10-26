// GET /api/admin/sellers — seller management list with verification + product counts.
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, getPagination, paginated } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import type { SellerAdminRow } from "@/lib/types";

function maskAccount(number: string | null): string | null {
  if (!number) return null;
  if (number.includes("X")) return number; // already masked at registration
  return `XXXXXXXX${number.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const p = getPagination(sp, 20);
    const status = sp.get("status")?.toUpperCase();
    const q = sp.get("q");

    const where: Prisma.SellerWhereInput = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { businessName: { contains: q } },
              { user: { is: { OR: [{ name: { contains: q } }, { email: { contains: q } }] } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      db.seller.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          verification: true,
          _count: { select: { products: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: p.skip,
        take: p.take,
      }),
      db.seller.count({ where }),
    ]);

    const items = rows.map<SellerAdminRow>((s) => ({
      id: s.id,
      businessName: s.businessName,
      ownerName: s.user.name,
      ownerEmail: s.user.email,
      status: s.status,
      commissionBps: s.commissionBps,
      productCount: s._count.products,
      createdAt: s.createdAt.toISOString(),
      verification: s.verification
        ? {
            accountType: s.verification.accountType,
            gstin: s.gstin,
            bankAccountMasked: maskAccount(s.verification.bankAccountNumber),
            bankIfsc: s.verification.bankIfsc,
            status: s.verification.status,
            reviewerNote: s.verification.reviewerNote,
          }
        : null,
    }));

    return ok(paginated(items, total, p));
  } catch (err) {
    return handleApiError(err);
  }
}
