import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { rateLimited } from "@/lib/api-rate-limit";
import { hasPermission, hashPassword } from "@/lib/auth/users";
import { persistAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/client";
import { withApiLog } from "@/lib/api-log";

// Optional explicit password; if absent, a readable random one is generated and
// returned ONCE so the admin can pass it on. An existing password can never be
// shown — it is only stored as a bcrypt hash and is not reversible.
const BodySchema = z.object({ password: z.string().min(8).max(128).optional() }).optional();

function generatePassword(): string {
  // 9 url-safe chars, no ambiguous 0/O/l/1 — easy to read out loud.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(9);
  let out = "";
  for (let i = 0; i < 9; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// POST /api/admin/customers/[id]/reset-password  (admin+)
async function POSTHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });

  const ip = getClientIp(req);
  const rl = adminApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "admin/customers/[id]/reset-password", ip, userId: session.userId, userEmail: session.email });

  if (!hasPermission(session.role, "admin")) {
    return NextResponse.json({ error: "دسترسی کافی ندارید" }, { status: 403 });
  }

  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (Number.isNaN(id) || id <= 0) return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });

  let body: unknown = undefined;
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "رمز عبور باید حداقل ۸ نویسه باشد" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });

  const newPassword = parsed.data?.password ?? generatePassword();
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(newPassword) } });

  const adminN = Number.parseInt(session.userId, 10);
  await persistAudit({
    action: "customer_password_reset",
    severity: "warn",
    adminId: Number.isNaN(adminN) ? null : adminN,
    userEmail: session.email,
    ip,
    userAgent: req.headers.get("user-agent"),
    details: { targetUserId: id, generated: !parsed.data?.password },
  });

  return NextResponse.json({ password: newPassword }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withApiLog("admin/customers/[id]/reset-password", POSTHandler);
