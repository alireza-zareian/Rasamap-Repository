import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { userApiRateLimit } from "@/lib/rate-limit";
import { listFavoriteSlugs } from "@/lib/db/favorites";

/** GET /api/favorites — the slugs this customer saved, for the hearts on a page (§40). */
export const GET = defineRoute(
  {
    name: "favorites",
    access: "customer",
    rateLimit: userApiRateLimit,
    messages: { signedOut: "برای ذخیرهٔ رسانه باید وارد حساب کاربری شوید" },
  },
  async ({ actor }) =>
    NextResponse.json({ slugs: await listFavoriteSlugs(actor) }, { headers: { "Cache-Control": "private, no-store" } }),
);
