import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { rateLimited } from "@/lib/api-rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { persistAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/client";
import { withApiLog } from "@/lib/api-log";

const IRAN_MOBILE = /^09\d{9}$/;

const PatchSchema = z
  .object({
    name:  z.string().min(1).max(120).trim().optional(),
    phone: z.string().regex(IRAN_MOBILE, "شماره موبایل معتبر نیست").optional(),
  })
  .refine(d => d.name !== undefined || d.phone !== undefined, { message: "تغییری ارسال نشده" });

function actorId(session: Awaited<ReturnType<typeof getSession>>): number | null {
  const n = Number.parseInt(session?.userId ?? "", 10);
  return Number.isNaN(n) ? null : n;
}

type Guarded = NextResponse | { session: NonNullable<Awaited<ReturnType<typeof getSession>>>; ip: string };

async function guard(req: NextRequest): Promise<Guarded> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  const ip = getClientIp(req);
  const rl = adminApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "admin/customers/[id]", ip, userId: session.userId, userEmail: session.email });
  if (!hasPermission(session.role, "admin")) return NextResponse.json({ error: "دسترسی کافی ندارید" }, { status: 403 });
  return { session, ip };
}

// GET /api/admin/customers/[id] — one user + the media they submitted (admin+)
async function GETHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const g = await guard(req);
  if (g instanceof NextResponse) return g;

  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (Number.isNaN(id) || id <= 0) return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, phone: true, createdAt: true,
      listings: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, name: true, city: true, status: true, plan: true,
          featured: true, price: true, createdAt: true,
        },
      },
      _count: { select: { listings: true, reviews: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });

  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}

// PATCH /api/admin/customers/[id] — edit name / phone (admin+)
async function PATCHHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const g = await guard(req);
  if (g instanceof NextResponse) return g;
  const { session, ip } = g;

  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (Number.isNaN(id) || id <= 0) return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, phone: true } });
  if (!existing) return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });

  const data = parsed.data;
  if (data.phone && data.phone !== existing.phone) {
    const clash = await prisma.user.findUnique({ where: { phone: data.phone }, select: { id: true } });
    if (clash) return NextResponse.json({ error: "این شماره قبلاً ثبت شده است" }, { status: 409 });
  }

  // The clash lookup above is a friendly pre-check; the unique index on
  // users.phone is what actually decides. Two admins editing at once can slip
  // between the two, so the constraint violation is turned into the same 409
  // rather than an unhandled 500.
  let updated: { id: number; name: string; phone: string; createdAt: Date };
  try {
    updated = await prisma.user.update({
      where: { id },
      data: { ...(data.name !== undefined ? { name: data.name } : {}), ...(data.phone !== undefined ? { phone: data.phone } : {}) },
      select: { id: true, name: true, phone: true, createdAt: true },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "این شماره قبلاً ثبت شده است" }, { status: 409 });
    }
    throw e;
  }

  await persistAudit({
    action: "customer_update",
    severity: "warn",
    adminId: actorId(session),
    userEmail: session.email,
    ip,
    userAgent: req.headers.get("user-agent"),
    details: {
      targetUserId: id,
      ...(data.name !== undefined ? { name: { from: existing.name, to: data.name } } : {}),
      ...(data.phone !== undefined ? { phoneChanged: data.phone !== existing.phone } : {}),
    },
  });

  return NextResponse.json({ user: updated }, { headers: { "Cache-Control": "no-store" } });
}

export const GET   = withApiLog("admin/customers/[id]", GETHandler);
export const PATCH = withApiLog("admin/customers/[id]", PATCHHandler);
