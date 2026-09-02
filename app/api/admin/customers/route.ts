import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { rateLimited } from "@/lib/api-rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { prisma } from "@/lib/db/client";
import { withApiLog } from "@/lib/api-log";

const SORTS = {
  created_desc: { createdAt: "desc" },
  created_asc:  { createdAt: "asc" },
  name_asc:     { name: "asc" },
} as const;

// GET /api/admin/customers — registered end-users directory (admin+)
async function GETHandler(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });

  const ip = getClientIp(req);
  const rl = adminApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "admin/customers", ip, userId: session.userId, userEmail: session.email });

  if (!hasPermission(session.role, "admin")) {
    return NextResponse.json({ error: "دسترسی کافی ندارید" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  const sortKey = (sp.get("sort") ?? "created_desc") as keyof typeof SORTS;
  const orderBy = SORTS[sortKey] ?? SORTS.created_desc;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10) || 20));

  const where = q
    ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }] }
    : {};

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        phone: true,
        createdAt: true,
        _count: { select: { listings: true, reviews: true } },
      },
    }),
  ]);

  const users = rows.map(u => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    createdAt: u.createdAt,
    listingCount: u._count.listings,
    reviewCount: u._count.reviews,
  }));

  return NextResponse.json(
    { users, total, page, pages: Math.max(1, Math.ceil(total / limit)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = withApiLog("admin/customers", GETHandler);
