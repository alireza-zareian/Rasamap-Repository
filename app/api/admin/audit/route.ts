import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/users";
import { getRecentAuditLogs } from "@/lib/auth/audit";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  if (!hasPermission(session.role, "admin")) {
    return NextResponse.json({ error: "دسترسی کافی ندارید" }, { status: 403 });
  }

  const rl = adminApiRateLimit(getClientIp(req));
  if (!rl.allowed) {
    return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });
  }

  const logs = getRecentAuditLogs(200);
  return NextResponse.json({ logs }, { headers: { "Cache-Control": "no-store" } });
}
