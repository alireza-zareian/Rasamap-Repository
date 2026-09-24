import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { positiveId } from "@/lib/http/params";
import { userApiRateLimit } from "@/lib/rate-limit";
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
    // Short: a thread people are replying to in real time should not sit in a
    // shared cache for half a minute after an answer lands.
    return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=30" } });
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
  async ({ actor, body }) => {
    const review = await saveReview(actor, body);
    return NextResponse.json({ review }, { status: 201 });
  },
);
