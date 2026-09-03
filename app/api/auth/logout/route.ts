import { NextRequest, NextResponse } from "next/server";
import { buildLogoutCookieHeader } from "@/lib/auth/session";
import { withApiLog } from "@/lib/api-log";

async function POSTHandler(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", buildLogoutCookieHeader(req));
  return res;
}

export const POST = withApiLog("auth/logout", POSTHandler);
