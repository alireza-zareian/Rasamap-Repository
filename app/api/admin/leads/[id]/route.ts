import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { rateLimited } from "@/lib/api-rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { persistAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/client";
import { LEAD_STATUSES } from "@/lib/types";
import { withApiLog } from "@/lib/api-log";

const PatchSchema = z
  .object({
    status: z.enum(LEAD_STATUSES as [string, ...string[]]).optional(),
    // "" clears the memo; the field is optional so a status-only PATCH keeps it.
    note:   z.string().max(500).trim().optional(),
  })
  .refine(d => d.status !== undefined || d.note !== undefined, { message: "تغییری ارسال نشده" });

/**
 * PATCH /api/admin/leads/[id] — move a lead through the follow-up states and
 * keep an internal memo on it (editor+).
 *
 * Only these two fields are writable. Who asked for which number and when is a
 * record of something that happened — an admin annotates it, never edits it.
 */
async function PATCHHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role === "user") {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rl = adminApiRateLimit(ip);
  if (!rl.allowed) {
    return rateLimited(rl, { endpoint: "admin/leads/[id]", ip, userId: session.userId, userEmail: session.email });
  }

  if (!hasPermission(session.role, "editor")) {
    return NextResponse.json({ error: "دسترسی کافی ندارید" }, { status: 403 });
  }

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

  const existing = await prisma.contactRequest.findUnique({
    where:  { id },
    select: { id: true, status: true, billboardId: true },
  });
  if (!existing) return NextResponse.json({ error: "سرنخ یافت نشد" }, { status: 404 });

  const { status, note } = parsed.data;
  const updated = await prisma.contactRequest.update({
    where: { id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(note   !== undefined ? { note: note === "" ? null : note } : {}),
    },
    select: {
      id: true, status: true, note: true, count: true,
      lastRequestedAt: true, createdAt: true,
      user:      { select: { id: true, name: true, phone: true } },
      billboard: { select: { id: true, name: true, slug: true, city: true, type: true, price: true, agency: true, phone: true } },
    },
  });

  const adminId = Number.parseInt(session.userId, 10);
  await persistAudit({
    action:   "lead_update",
    severity: "info",
    adminId:  Number.isNaN(adminId) ? null : adminId,
    userEmail: session.email,
    ip,
    userAgent: req.headers.get("user-agent"),
    // No phone or name here — the log records which lead moved, not who it is.
    details: { leadId: id, billboardId: existing.billboardId, from: existing.status, to: updated.status, noteChanged: note !== undefined },
  });

  return NextResponse.json({ lead: updated }, { headers: { "Cache-Control": "no-store" } });
}

export const PATCH = withApiLog("admin/leads/[id]", PATCHHandler);
