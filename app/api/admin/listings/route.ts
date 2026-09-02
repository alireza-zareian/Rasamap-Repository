import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { rateLimited } from "@/lib/api-rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { prisma } from "@/lib/db/client";
import { UNPUBLISHED_STATUSES } from "@/lib/db/billboards";
import { withApiLog } from "@/lib/api-log";

const QuerySchema = z.object({
  status: z.enum(["pending", "awaiting_payment", ""]).optional().default(""),
  page:   z.coerce.number().int().min(1).max(1000).optional().default(1),
  limit:  z.coerce.number().int().min(1).max(50).optional().default(20),
});

// GET /api/admin/listings — the approval queue: user submissions still waiting
// on a decision, newest first. editor+ may look; only admin+ may decide (see
// the decision route).
async function GETHandler(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "user") {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rl = adminApiRateLimit(ip);
  if (!rl.allowed) {
    return rateLimited(rl, { endpoint: "admin/listings", ip, userId: session.userId, userEmail: session.email });
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
  const where = { status: status ? status : { in: UNPUBLISHED_STATUSES } };

  const [rows, total] = await Promise.all([
    prisma.billboard.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, name: true, city: true, region: true, location: true,
        type: true, price: true, width: true, height: true, faces: true,
        status: true, plan: true, featured: true, images: true,
        description: true, phone: true, createdAt: true,
        submittedBy: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.billboard.count({ where }),
  ]);

  return NextResponse.json(
    {
      listings: rows.map(r => ({ ...r, images: r.images as string[] })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = withApiLog("admin/listings", GETHandler);
