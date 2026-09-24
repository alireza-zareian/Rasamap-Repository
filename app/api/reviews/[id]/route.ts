import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { userApiRateLimit } from "@/lib/rate-limit";
import { deleteReview } from "@/lib/db/reviews";

/**
 * DELETE /api/reviews/[id] — a customer removes their own review.
 *
 * Editing needs no route of its own: POST /api/reviews upserts on the unique
 * (billboardId, userId) pair, so submitting again replaces what is there.
 */
export const DELETE = defineRoute(
  {
    name: "reviews/[id]",
    access: "customer",
    rateLimit: userApiRateLimit,
    params: idParams,
    messages: { signedOut: "برای حذف نظر باید وارد حساب کاربری شوید" },
  },
  async ({ actor, params }) => {
    await deleteReview(actor, params.id);
    return NextResponse.json({ ok: true });
  },
);
