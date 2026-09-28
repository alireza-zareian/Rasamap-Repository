import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { publicApiRateLimit } from "@/lib/rate-limit";
import { getActor, toCurrentUser } from "@/lib/auth/actor";

/**
 * GET /api/auth/session — who is signed in, or `null`. The question every page
 * asks once on load (lib/client/use-current-user.tsx). Signed out is an answer
 * here, not a failure: asked through GET /api/auth/me, every guest page load
 * logged a 401 and printed a red error in the browser console. /api/auth/me
 * keeps its 401, which the tests of signing out read.
 */
export const GET = defineRoute(
  { name: "auth/session", access: "public", rateLimit: publicApiRateLimit },
  async () => {
    const actor = await getActor();
    return NextResponse.json(
      { user: actor ? toCurrentUser(actor) : null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
);
