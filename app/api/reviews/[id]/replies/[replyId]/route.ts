import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { positiveId } from "@/lib/http/params";
import { userApiRateLimit } from "@/lib/rate-limit";
import { deleteReply } from "@/lib/db/reviews";

// DELETE /api/reviews/[id]/replies/[replyId] — by its author, or by an editor and above.
export const DELETE = defineRoute(
  {
    name: "reviews/[id]/replies/[replyId]",
    access: "signed-in",
    rateLimit: userApiRateLimit,
    params: z.object({ id: positiveId, replyId: positiveId }),
  },
  async ({ actor, params }) => {
    await deleteReply(actor, params.id, params.replyId);
    return NextResponse.json({ ok: true });
  },
);
