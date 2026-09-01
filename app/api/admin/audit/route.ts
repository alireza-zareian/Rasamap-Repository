import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/users";
import { getRecentAuditLogs } from "@/lib/auth/audit";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";

function getIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  if (!hasPermission(session.role, "admin")) {
    return NextResponse.json({ error: "دسترسی کافی ندارید" }, { status: 403 });
  }

  const rl = adminApiRateLimit(getIP(req));
  if (!rl.allowed) {
    return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });
  }

  const logs = getRecentAuditLogs(200);
  return NextResponse.json({ logs }, { headers: { "Cache-Control": "no-store" } });
}
