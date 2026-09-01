import { NextResponse } from "next/server";
import { buildLogoutCookieHeader } from "@/lib/auth/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", buildLogoutCookieHeader());
  return res;
}
