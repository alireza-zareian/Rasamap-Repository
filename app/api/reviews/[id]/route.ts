import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { userApiRateLimit } from "@/lib/rate-limit";
import { deleteReview } from "@/lib/db/reviews";

/**
 * DELETE /api/reviews/[id] — the author removes their own review, or an editor
 * (or above) removes someone else's as moderation, which is audited.
 *
 * Editing needs no route of its own: POST /api/reviews upserts on the unique
 * (billboardId, userId) pair, so submitting again replaces what is there.
 */
export const DELETE = defineRoute(
  {
    name: "reviews/[id]",
    access: "signed-in",
    rateLimit: userApiRateLimit,
    params: idParams,
    messages: { signedOut: "برای حذف نظر باید وارد حساب کاربری شوید" },
  },
  async ({ actor, params, audit }) => {
    const { moderated, billboardId } = await deleteReview(actor, params.id);
    if (moderated) {
      await audit("review_delete", { severity: "warn", details: { reviewId: params.id, billboardId } });
    }
    return NextResponse.json({ ok: true });
  },
);
