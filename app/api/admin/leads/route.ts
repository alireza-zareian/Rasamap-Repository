import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { rateLimited } from "@/lib/api-rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { prisma } from "@/lib/db/client";
import { LEAD_STATUSES } from "@/lib/types";
import { withApiLog } from "@/lib/api-log";

const QuerySchema = z.object({
  status: z.enum(["new", "contacted", "closed", ""]).optional().default(""),
  page:   z.coerce.number().int().min(1).max(1000).optional().default(1),
  limit:  z.coerce.number().int().min(1).max(50).optional().default(20),
});

/**
 * GET /api/admin/leads — the demand side of the marketplace.
 *
 * One row per (media, account) that asked for the owner's phone number, newest
 * activity first, with the counts per follow-up state so the panel can show
 * them without a second request. editor+ may read: the listings queue already
 * shows a submitter's phone to the same roles.
 */
async function GETHandler(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "user") {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rl = adminApiRateLimit(ip);
  if (!rl.allowed) {
    return rateLimited(rl, { endpoint: "admin/leads", ip, userId: session.userId, userEmail: session.email });
  }

  if (!hasPermission(session.role, "editor")) {
    return NextResponse.json({ error: "دسترسی کافی ندارید" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    status: sp.get("status") ?? "",
    page:   sp.get("page")   ?? "1",
    limit:  sp.get("limit")  ?? "20",
  });
  if (!parsed.success) return NextResponse.json({ error: "پارامترهای نامعتبر" }, { status: 400 });

  const { status, page, limit } = parsed.data;
  const where = status ? { status } : {};

  const [rows, total, grouped] = await Promise.all([
    prisma.contactRequest.findMany({
      where,
      orderBy: { lastRequestedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, status: true, note: true, count: true,
        lastRequestedAt: true, createdAt: true,
        user:      { select: { id: true, name: true, phone: true } },
        billboard: { select: { id: true, name: true, slug: true, city: true, type: true, price: true, agency: true, phone: true } },
      },
    }),
    prisma.contactRequest.count({ where }),
    prisma.contactRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  // Seed every known status with 0 so the panel's filter never hides a state
  // just because nothing is in it yet.
  const counts: Record<string, number> = Object.fromEntries(LEAD_STATUSES.map(s => [s, 0]));
  for (const g of grouped) counts[g.status] = g._count._all;

  return NextResponse.json(
    {
      leads: rows,
      counts,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = withApiLog("admin/leads", GETHandler);
