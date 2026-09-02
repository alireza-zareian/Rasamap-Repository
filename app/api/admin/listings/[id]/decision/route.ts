import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { rateLimited } from "@/lib/api-rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { persistAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/client";
import { UNPUBLISHED_STATUSES } from "@/lib/db/billboards";
import { withApiLog } from "@/lib/api-log";

/**
 * POST /api/admin/listings/[id]/decision — approve or reject a submission.
 *
 * The one place the listing state machine is enforced:
 *
 *   pending          --approve--> available   (content checked)
 *   awaiting_payment --approve--> available + featured=true
 *                                 (admin confirms the transfer by hand; there
 *                                  is no payment gateway — see §17 of
 *                                  docs/engineering-decisions.md)
 *   either           --reject---> rejected  (never publicly reachable)
 *
 * Only rows still awaiting a decision are accepted, so a second click cannot
 * re-approve a live listing or silently re-grant a paid promotion.
 */
const BodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note:     z.string().max(300).optional(),
});

async function POSTHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role === "user") {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rl = adminApiRateLimit(ip);
  if (!rl.allowed) {
    return rateLimited(rl, { endpoint: "admin/listings/[id]/decision", ip, userId: session.userId, userEmail: session.email });
  }

  // Publishing someone's paid listing is a money decision, not an edit.
  if (!hasPermission(session.role, "admin")) {
    return NextResponse.json({ error: "فقط ادمین می‌تواند آگهی را تأیید یا رد کند" }, { status: 403 });
  }

  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (Number.isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }

  const existing = await prisma.billboard.findUnique({
    where:  { id },
    select: { id: true, name: true, status: true, plan: true, submittedById: true },
  });
  if (!existing) return NextResponse.json({ error: "آگهی یافت نشد" }, { status: 404 });

  if (!UNPUBLISHED_STATUSES.includes(existing.status)) {
    return NextResponse.json(
      { error: "این آگهی قبلاً بررسی شده است" },
      { status: 409 },
    );
  }

  const approve = parsed.data.decision === "approve";
  // A featured slot is granted only here, on an approval of a row that actually
  // asked and paid for one — never from the submitted plan alone.
  const grantFeatured = approve && existing.plan === "featured";

  const updated = await prisma.billboard.update({
    where: { id },
    data: {
      status:   approve ? "available" : "rejected",
      featured: grantFeatured,
    },
    select: { id: true, name: true, status: true, plan: true, featured: true },
  });

  const actorId = Number.parseInt(session.userId, 10);
  await persistAudit({
    action: approve ? "listing_approved" : "listing_rejected",
    severity: "warn",
    adminId: Number.isNaN(actorId) ? null : actorId,
    userEmail: session.email,
    ip,
    userAgent: req.headers.get("user-agent"),
    details: {
      billboardId: id,
      from: existing.status,
      to: updated.status,
      plan: existing.plan,
      featuredGranted: grantFeatured,
      submittedById: existing.submittedById,
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
    },
  });

  return NextResponse.json({ listing: updated }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withApiLog("admin/listings/[id]/decision", POSTHandler);
