import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { buildLogoutCookieHeader, getSession } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit";
import { revokeSession } from "@/lib/db/sessions";

// Not rate limited: see "none" in lib/http/route.ts. Signing out must work even
// for a session whose account was just deactivated, so it reads the token
// rather than requiring a live staff actor. The token is revoked as well as the
// cookie cleared — see app/api/auth/logout/route.ts.
export const POST = defineRoute(
  { name: "admin/auth/logout", access: "public", rateLimit: "none" },
  async ({ req, ip }) => {
    const session = await getSession();
    if (session) await revokeSession(session.jti, new Date(session.exp * 1000));
    if (session?.kind === "staff") {
      auditLog("logout", "info", { userId: `staff:${session.sub}`, userEmail: session.email, ip });
    }
    const res = NextResponse.json({ ok: true });
    res.headers.set("Set-Cookie", buildLogoutCookieHeader(req));
    return res;
  },
);
