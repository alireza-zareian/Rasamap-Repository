import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { userApiRateLimit } from "@/lib/auth/rate-limit";
import { getBillboardBySlug } from "@/lib/db/billboards";
import { prisma } from "@/lib/db/client";
import { serverError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api-log";

const slugSchema = z.string().min(1).max(120).regex(/^[a-z0-9-]+$/);

/**
 * POST /api/billboards/[slug]/contact — hand the owner's phone number to a
 * signed-in user, and record that it happened.
 *
 * POST rather than GET on purpose. The number is the end of Rasamap's part in
 * the transaction (there is no booking — §17 of docs/engineering-decisions.md),
 * so the reveal is the last observable signal of demand and the only thing the
 * lead table can be built from. A GET would be fired by every page render and
 * would record interest that nobody expressed; asking for the number is now an
 * explicit click, and an explicit click is a write.
 *
 * The number is kept out of every public response so it cannot be scraped
 * anonymously (§20).
 */
async function postHandler(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  // 1. Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "برای دیدن اطلاعات تماس باید وارد حساب کاربری شوید" }, { status: 401 });
  }

  // 2. Rate limit
  const ip = getClientIp(req);
  const rl = userApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "billboards/[slug]/contact", ip });

  // 3. Zod
  const { slug } = await params;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }

  // 4. Business logic
  try {
    const billboard = await getBillboardBySlug(parsed.data);
    if (!billboard) {
      return NextResponse.json({ error: "رسانه یافت نشد" }, { status: 404 });
    }
    const phone = billboard.phone && billboard.phone !== "—" ? billboard.phone.trim() : "";

    // Only a customer account produces a lead. An admin session's userId points
    // at the admins table, so writing it into ContactRequest.userId would break
    // the foreign key — and an admin checking a page is not demand anyway.
    if (session.role === "user") {
      await recordLead(billboard.id, parseInt(session.userId, 10));
    }

    return NextResponse.json(
      { phone, agency: billboard.agency ?? "" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return serverError("POST /api/billboards/[slug]/contact", err, { slug });
  }
}

/**
 * Get-or-create the lead for this (media, account) pair.
 *
 * A second reveal by the same person is the same lead, so the unique index on
 * (billboardId, userId) is what defines a duplicate, and the repeat is kept as
 * an atomic `count` increment rather than a second row — `increment` is a single
 * UPDATE, so two simultaneous clicks cannot both read 1 and both write 2.
 *
 * A failure here must not cost the user the phone number they asked for: the
 * lead is bookkeeping, the number is the product. So this logs and returns
 * instead of throwing — but it logs, it does not swallow.
 */
async function recordLead(billboardId: number, userId: number): Promise<void> {
  if (!Number.isInteger(userId)) return;
  try {
    await prisma.contactRequest.upsert({
      where:  { billboardId_userId: { billboardId, userId } },
      update: { count: { increment: 1 }, lastRequestedAt: new Date() },
      create: { billboardId, userId },
    });
  } catch (err) {
    // P2002: two first-ever clicks raced and both tried to insert. The row the
    // other one created is the right answer, so count that click and move on.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      try {
        await prisma.contactRequest.update({
          where: { billboardId_userId: { billboardId, userId } },
          data:  { count: { increment: 1 }, lastRequestedAt: new Date() },
        });
        return;
      } catch (retryErr) {
        logger.error("contact lead retry failed", { billboardId, userId, error: String(retryErr) });
        return;
      }
    }
    logger.error("contact lead write failed", {
      billboardId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const POST = withApiLog("billboards/[slug]/contact", postHandler);
