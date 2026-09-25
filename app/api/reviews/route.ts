import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { positiveId } from "@/lib/http/params";
import { accountWriteRateLimit, userApiRateLimit } from "@/lib/rate-limit";
import { listReviews, saveReview } from "@/lib/db/reviews";

// GET /api/reviews?billboardId=X — public
export const GET = defineRoute(
  {
    name: "reviews",
    access: "public",
    rateLimit: userApiRateLimit,
    query: z.object({ billboardId: positiveId }),
    messages: { invalidQuery: "billboardId الزامی است" },
  },
  async ({ query }) => {
    const result = await listReviews(query.billboardId);
    // Not cached at all. The page re-reads this right after every post, edit,
    // reply and delete, and `max-age=5, stale-while-revalidate=30` let the
    // browser answer that re-read from its own cache — so a deleted reply
    // could stay on screen for half a minute after the delete succeeded.
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  },
);

// POST /api/reviews — one review per media per customer; a second one edits the first.
export const POST = defineRoute(
  {
    name: "reviews",
    access: "customer",
    rateLimit: userApiRateLimit,
    body: z.object({
      billboardId: z.number().int().positive(),
      rating:      z.number().int().min(1).max(5),
      comment:     z.string().min(10).max(1000),
    }),
    messages: { signedOut: "برای ثبت نظر باید وارد حساب کاربری شوید" },
  },
  async ({ actor, body, tooMany }) => {
    const perAccount = await accountWriteRateLimit("review", String(actor.id));
    if (!perAccount.allowed) return tooMany(perAccount);
    const review = await saveReview(actor, body);
    return NextResponse.json({ review }, { status: 201 });
  },
);
