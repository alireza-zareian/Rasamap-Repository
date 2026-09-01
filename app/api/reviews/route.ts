import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { userApiRateLimit } from "@/lib/auth/rate-limit";
import { withApiLog } from "@/lib/api-log";

const ReviewSchema = z.object({
  billboardId: z.number().int().positive(),
  rating:      z.number().int().min(1).max(5),
  comment:     z.string().min(10).max(1000),
});

// GET /api/reviews?billboardId=X — public
async function GETHandler(req: NextRequest) {
  const rl = userApiRateLimit(getClientIp(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });

  const billboardId = parseInt(req.nextUrl.searchParams.get("billboardId") ?? "", 10);
  if (isNaN(billboardId)) return NextResponse.json({ error: "billboardId الزامی است" }, { status: 400 });

  const reviews = await prisma.review.findMany({
    where:   { billboardId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take:    50,
  });

  const avg = reviews.length
    ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
    : null;

  return NextResponse.json({ reviews, avg, total: reviews.length }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
}

// POST /api/reviews — user auth required; must have a confirmed reservation
async function POSTHandler(req: NextRequest) {
  // 1. Auth
  const session = await getSession();
  if (!session || session.role !== "user") {
    return NextResponse.json({ error: "برای ثبت نظر باید وارد حساب کاربری شوید" }, { status: 401 });
  }

  // 2. Rate limit
  const rl = userApiRateLimit(getClientIp(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });

  // 3. Zod
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 }); }

  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }

  // 4. Business logic
  const { billboardId, rating, comment } = parsed.data;
  const userId = parseInt(session.userId, 10);

  // Check confirmed reservation
  const confirmed = await prisma.reservation.findFirst({
    where: { billboardId, userId, status: "confirmed" },
    select: { id: true },
  });
  if (!confirmed) {
    return NextResponse.json({ error: "فقط کاربرانی که رزرو تأیید شده دارند می‌توانند نظر ثبت کنند" }, { status: 403 });
  }

  // Upsert — one review per user per billboard
  const review = await prisma.review.upsert({
    where:  { billboardId_userId: { billboardId, userId } },
    update: { rating, comment },
    create: { billboardId, userId, rating, comment },
    include: { user: { select: { name: true } } },
  });

  return NextResponse.json({ review }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiLog("reviews", GETHandler);
export const POST = withApiLog("reviews", POSTHandler);
