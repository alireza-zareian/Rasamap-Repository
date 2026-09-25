import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { buildLogoutCookieHeader, getSession } from "@/lib/auth/session";
import { revokeSession } from "@/lib/db/sessions";

// Not rate limited: see "none" in lib/http/route.ts. The token is revoked, not
// only the cookie cleared: a copy of it elsewhere would otherwise stay signed
// in until it expired. Other devices of the same account are not touched.
export const POST = defineRoute(
  { name: "auth/logout", access: "public", rateLimit: "none" },
  async ({ req }) => {
    const session = await getSession();
    if (session) await revokeSession(session.jti, new Date(session.exp * 1000));
    const res = NextResponse.json({ ok: true });
    res.headers.set("Set-Cookie", buildLogoutCookieHeader(req));
    return res;
  },
);
