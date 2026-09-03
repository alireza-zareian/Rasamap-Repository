import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { getSession, buildLogoutCookieHeader } from "@/lib/auth/session";
import { auditLog } from "@/lib/auth/audit";
import { withApiLog } from "@/lib/api-log";

async function POSTHandler(req: NextRequest) {
  const session = await getSession();

  if (session) {
    auditLog("logout", "info", {
      userId:    session.userId,
      userEmail: session.email,
      ip: getClientIp(req),
    });
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", buildLogoutCookieHeader(req));
  return res;
}

export const POST = withApiLog("admin/auth/logout", POSTHandler);
