// GET /api/admin/users — user directory with order counts (never exposes password hashes).
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, getPagination, paginated } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const p = getPagination(sp, 20);
    const role = sp.get("role")?.toUpperCase();
    const q = sp.get("q");

    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
    };

    const [rows, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          _count: { select: { orders: true } },
          seller: { select: { id: true, businessName: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: p.skip,
        take: p.take,
      }),
      db.user.count({ where }),
    ]);

    const items = rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      orderCount: u._count.orders,
      seller: u.seller
        ? { id: u.seller.id, businessName: u.seller.businessName, status: u.seller.status }
        : null,
      createdAt: u.createdAt.toISOString(),
    }));

    return ok(paginated(items, total, p));
  } catch (err) {
    return handleApiError(err);
  }
}
