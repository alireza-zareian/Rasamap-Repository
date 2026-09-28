import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { positiveId } from "@/lib/http/params";
import { accountWriteRateLimit, userApiRateLimit } from "@/lib/rate-limit";
import { listReviews, saveReview } from "@/lib/db/reviews";
import { REVIEW_COMMENT } from "@/lib/domain/rating";

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
    // Not cached: the page re-reads it right after each change, and a cached
    // answer kept a deleted reply on screen for half a minute.
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
      comment:     z.string().min(REVIEW_COMMENT.min).max(REVIEW_COMMENT.max),
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
