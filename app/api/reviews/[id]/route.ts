import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { userApiRateLimit } from "@/lib/rate-limit";
import { deleteReview } from "@/lib/db/reviews";

/**
 * DELETE /api/reviews/[id] — by its author, or by an editor as audited
 * moderation. Editing is POST /api/reviews again, which upserts.
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
