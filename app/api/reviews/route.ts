import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { UNPUBLISHED_STATUSES } from "@/lib/db/billboards";
import { userApiRateLimit } from "@/lib/auth/rate-limit";
import { withApiLog } from "@/lib/api-log";

// Any signed-in account may review, once per media (enforced by the unique
// index on (billboardId, userId), which the upsert below relies on). Rasamap
// does not process the transaction, so there is no purchase record to gate on;
// pretending otherwise would be a check that verifies nothing.

const ReviewSchema = z.object({
  billboardId: z.number().int().positive(),
  rating:      z.number().int().min(1).max(5),
  comment:     z.string().min(10).max(1000),
});

// GET /api/reviews?billboardId=X — public
async function GETHandler(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = userApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "reviews", ip });

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

// POST /api/reviews — signed-in users only; one review per media per account
async function POSTHandler(req: NextRequest) {
  // 1. Auth
  const session = await getSession();
  if (!session || session.role !== "user") {
    return NextResponse.json({ error: "برای ثبت نظر باید وارد حساب کاربری شوید" }, { status: 401 });
  }

  // 2. Rate limit
  const ip = getClientIp(req);
  const rl = userApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "reviews", ip });

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

  // The media has to exist and be published — a review on an unapproved listing
  // would be invisible anyway, and this keeps an arbitrary id from creating one.
  const billboard = await prisma.billboard.findUnique({
    where:  { id: billboardId },
    select: { id: true, status: true },
  });
  if (!billboard || UNPUBLISHED_STATUSES.includes(billboard.status)) {
    return NextResponse.json({ error: "رسانه یافت نشد" }, { status: 404 });
  }

  // Write the review and refresh the billboard's aggregate in one transaction.
  // billboards.rating / reviewCount are a denormalised summary of this table —
  // they are what the catalogue cards and the compare table read, so they have
  // to be recomputed here or the two would disagree. Recomputing from an
  // aggregate (rather than incrementing) keeps them correct even when an
  // existing review is edited, since the upsert may replace a rating.
  const review = await prisma.$transaction(async (tx) => {
    const saved = await tx.review.upsert({
      where:  { billboardId_userId: { billboardId, userId } },
      update: { rating, comment },
      create: { billboardId, userId, rating, comment },
      include: { user: { select: { name: true } } },
    });

    const agg = await tx.review.aggregate({
      where:  { billboardId },
      _avg:   { rating: true },
      _count: { _all: true },
    });
    await tx.billboard.update({
      where: { id: billboardId },
      data: {
        rating:      Math.round((agg._avg.rating ?? 0) * 10) / 10,
        reviewCount: agg._count._all,
      },
    });

    return saved;
  });

  return NextResponse.json({ review }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiLog("reviews", GETHandler);
export const POST = withApiLog("reviews", POSTHandler);
