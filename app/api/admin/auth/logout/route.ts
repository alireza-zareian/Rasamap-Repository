import { NextRequest, NextResponse } from "next/server";
import { getSession, buildLogoutCookieHeader } from "@/lib/auth/session";
import { auditLog } from "@/lib/auth/audit";

export async function POST(req: NextRequest) {
  const session = await getSession();

  if (session) {
    auditLog("logout", "info", {
      userId:    session.userId,
      userEmail: session.email,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown",
    });
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", buildLogoutCookieHeader());
  return res;
}
