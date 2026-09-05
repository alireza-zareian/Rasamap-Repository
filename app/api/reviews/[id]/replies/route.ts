import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { getSession } from "@/lib/auth/session";
import { userApiRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db/client";
import { withApiLog } from "@/lib/api-log";

const ReplySchema = z.object({
  body: z.string().trim().min(2, "پاسخ خیلی کوتاه است").max(600, "پاسخ خیلی بلند است"),
});

/**
 * POST /api/reviews/[id]/replies — answer a review.
 *
 * Open to any signed-in account, customer or staff, the way a comment thread
 * works: the person who left the review is not the only one with something to
 * say, and the team needs a way to answer in public rather than only in the
 * admin panel.
 *
 * A staff reply stores no account id. The administrator configured through the
 * environment has no row in `admins`, so a foreign key would reject exactly the
 * account most likely to be answering; the display name is written onto the
 * reply instead and `isStaff` is what the badge reads. Replies do not nest —
 * one level keeps the thread readable and the read a single join.
 */
async function POSTHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "برای پاسخ دادن باید وارد حساب کاربری شوید" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rl = userApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "reviews/[id]/replies", ip });

  const { id: raw } = await params;
  const reviewId = Number.parseInt(raw, 10);
  if (Number.isNaN(reviewId) || reviewId <= 0) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }

  let payload: unknown;
  try { payload = await req.json(); } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }
  const parsed = ReplySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }

  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { id: true } });
  if (!review) return NextResponse.json({ error: "نظر یافت نشد" }, { status: 404 });

  const isStaff = session.role !== "user";
  const userId = isStaff ? null : Number.parseInt(session.userId, 10);
  if (userId !== null && Number.isNaN(userId)) {
    return NextResponse.json({ error: "نشست نامعتبر است" }, { status: 401 });
  }

  const reply = await prisma.reviewReply.create({
    data: {
      reviewId,
      userId,
      authorName: session.name || (isStaff ? "تیم رسامپ" : "کاربر"),
      isStaff,
      body: parsed.data.body,
    },
    select: { id: true, reviewId: true, userId: true, authorName: true, isStaff: true, body: true, createdAt: true },
  });

  return NextResponse.json({ reply }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export const POST = withApiLog("reviews/[id]/replies", POSTHandler);
