import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { buildLogoutCookieHeader } from "@/lib/auth/session";

// Not rate limited: see "none" in lib/http/route.ts.
export const POST = defineRoute(
  { name: "auth/logout", access: "public", rateLimit: "none" },
  async ({ req }) => {
    const res = NextResponse.json({ ok: true });
    res.headers.set("Set-Cookie", buildLogoutCookieHeader(req));
    return res;
  },
);
