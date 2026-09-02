import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { getAdminBillboardPage, createBillboard } from "@/lib/db/billboards";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { persistAudit } from "@/lib/auth/audit";
import { serverError } from "@/lib/api-error";
import { z } from "zod";
import { BILLBOARD_STATUSES } from "@/lib/types";
import { withApiLog } from "@/lib/api-log";

const ALLOWED_SORT_KEYS = new Set(["id", "price", "name", "city"]);
const ALLOWED_SORT_DIRS = new Set(["asc", "desc"]);
const ALLOWED_TYPES     = new Set(["billboard", "digital", "bridge", "station", "vehicle", ""]);
// The full set, pipeline states included: user submissions land in `pending` /
// `awaiting_payment` and the admin panel is the only place they can be found
// and approved. "" means "no status filter".
const ALLOWED_STATUSES  = new Set<string>([...BILLBOARD_STATUSES, ""]);

const QuerySchema = z.object({
  q:      z.string().max(200).optional().default(""),
  city:   z.string().max(100).optional().default(""),
  type:   z.string().max(50).optional().default(""),
  status: z.string().max(50).optional().default(""),
  page:   z.coerce.number().int().min(1).max(10000).optional().default(1),
  limit:  z.coerce.number().int().min(1).max(100).optional().default(20),
  sort:   z.string().max(30).optional().default("id_asc"),
});

// GET /api/admin/billboards
async function GETHandler(req: NextRequest) {
  // ── Auth guard ──
  const session = await getSession();
  if (!session || session.role === "user") {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  // ── Rate limit ──
  const rl = adminApiRateLimit(getClientIp(req));
  if (!rl.allowed) {
    return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });
  }

  // ── Validate & sanitize query params ──
  const sp = req.nextUrl.searchParams;
  const rawParams = {
    q:      sp.get("q")      ?? "",
    city:   sp.get("city")   ?? "",
    type:   sp.get("type")   ?? "",
    status: sp.get("status") ?? "",
    page:   sp.get("page")   ?? "1",
    limit:  sp.get("limit")  ?? "20",
    sort:   sp.get("sort")   ?? "id_asc",
  };

  const parsed = QuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const { q, city, type, status, page, limit, sort } = parsed.data;

  // Validate sort components against allowlist
  const [sortKey, sortDir] = sort.split("_");
  if (!ALLOWED_SORT_KEYS.has(sortKey) || !ALLOWED_SORT_DIRS.has(sortDir)) {
    return NextResponse.json({ error: "Invalid sort parameter" }, { status: 400 });
  }
  if (type && !ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
  }
  if (status && !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status parameter" }, { status: 400 });
  }

  // ── Filter + sort + paginate in the DB ──
  const { items, total, pages } = await getAdminBillboardPage({
    q: q || undefined,
    city: city || undefined,
    type: type || undefined,
    status: status || undefined,
    sortKey: sortKey as "id" | "price" | "name" | "city",
    sortDir: sortDir as "asc" | "desc",
    page,
    limit,
  });

  return NextResponse.json(
    { items, total, pages, page },
    {
      headers: {
        "X-RateLimit-Remaining": rl.remaining.toString(),
        "Cache-Control": "no-store",
      },
    }
  );
}

const ALLOWED_CREATE_TYPES = new Set(["billboard", "digital", "bridge", "station", "vehicle"]);

const CreateSchema = z.object({
  name:        z.string().min(2).max(200),
  location:    z.string().min(3).max(300),
  city:        z.string().min(1).max(100),
  type:        z.string(),
  price:       z.number().int().min(0),
  agency:      z.string().max(200).optional().default(""),
  phone:       z.string().max(20).optional().default(""),
  description: z.string().max(2000).optional().default(""),
  width:       z.number().int().min(1).max(100).optional().default(12),
  height:      z.number().int().min(1).max(100).optional().default(4),
  faces:       z.number().int().min(1).max(10).optional().default(1),
  lat:         z.number().min(24).max(40).optional().nullable(),
  lng:         z.number().min(44).max(64).optional().nullable(),
});

// POST /api/admin/billboards — create a new billboard (editor+ required)
async function POSTHandler(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  if (!hasPermission(session.role, "editor")) return NextResponse.json({ error: "دسترسی کافی ندارید" }, { status: 403 });

  const rl = adminApiRateLimit(getClientIp(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 }); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "اطلاعات نامعتبر", details: parsed.error.flatten() }, { status: 400 });

  const { type, ...rest } = parsed.data;
  if (!ALLOWED_CREATE_TYPES.has(type)) return NextResponse.json({ error: "نوع رسانه نامعتبر است" }, { status: 400 });

  try {
    const billboard = await createBillboard({ type, ...rest });
    const adminId = Number.parseInt(session.userId, 10);
    await persistAudit({
      action: "billboard_create",
      adminId: Number.isNaN(adminId) ? null : adminId,
      userEmail: session.email,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
      details: { billboardId: billboard.id, name: billboard.name, type: billboard.type },
    });
    return NextResponse.json({ billboard }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return serverError("POST /api/admin/billboards", err, { adminId: session.userId });
  }
}

export const GET = withApiLog("admin/billboards", GETHandler);
export const POST = withApiLog("admin/billboards", POSTHandler);
