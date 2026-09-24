import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { userApiRateLimit } from "@/lib/rate-limit";
import { addReply } from "@/lib/db/reviews";

// POST /api/reviews/[id]/replies — answer a review, as a customer or as staff.
export const POST = defineRoute(
  {
    name: "reviews/[id]/replies",
    access: "signed-in",
    rateLimit: userApiRateLimit,
    params: idParams,
    body: z.object({
      body: z.string().trim().min(2, "پاسخ خیلی کوتاه است").max(600, "پاسخ خیلی بلند است"),
    }),
    messages: { signedOut: "برای پاسخ دادن باید وارد حساب کاربری شوید" },
  },
  async ({ actor, params, body }) => {
    const reply = await addReply(actor, params.id, body.body);
    return NextResponse.json({ reply }, { status: 201 });
  },
);
