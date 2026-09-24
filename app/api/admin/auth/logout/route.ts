import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { buildLogoutCookieHeader, getSession } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit";

// Not rate limited: see "none" in lib/http/route.ts. Signing out must work even
// for a session whose account was just deactivated, so it reads the token
// rather than requiring a live staff actor.
export const POST = defineRoute(
  { name: "admin/auth/logout", access: "public", rateLimit: "none" },
  async ({ req, ip }) => {
    const session = await getSession();
    if (session?.kind === "staff") {
      auditLog("logout", "info", { userId: `staff:${session.sub}`, userEmail: session.email, ip });
    }
    const res = NextResponse.json({ ok: true });
    res.headers.set("Set-Cookie", buildLogoutCookieHeader(req));
    return res;
  },
);
