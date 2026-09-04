import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { getSession } from "@/lib/auth/session";
import { userApiRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db/client";
import { withApiLog } from "@/lib/api-log";

/**
 * DELETE /api/reviews/[id] — a user removes their own review.
 *
 * Editing needs no route of its own: `POST /api/reviews` upserts on the unique
 * (billboardId, userId) pair, so submitting again replaces what is there.
 * Removal is the one thing that had no way to happen.
 *
 * The billboard's `rating` and `reviewCount` are a denormalised summary of this
 * table, so they are recomputed inside the same transaction as the delete —
 * otherwise a removed one-star review would keep dragging the average down.
 */
async function DELETEHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "user") {
    return NextResponse.json({ error: "برای حذف نظر باید وارد حساب کاربری شوید" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rl = userApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "reviews/[id]", ip });

  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (Number.isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }

  const userId = Number.parseInt(session.userId, 10);
  const review = await prisma.review.findUnique({
    where:  { id },
    select: { id: true, userId: true, billboardId: true },
  });

  // Someone else's review is reported as missing rather than forbidden: the
  // difference would tell a stranger which ids exist.
  if (!review || review.userId !== userId) {
    return NextResponse.json({ error: "نظر یافت نشد" }, { status: 404 });
  }

  const { billboardId } = review;
  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id } });

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
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export const DELETE = withApiLog("reviews/[id]", DELETEHandler);
