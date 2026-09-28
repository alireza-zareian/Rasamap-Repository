import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { getRecentAuditLogs } from "@/lib/audit";
import { listAuditRows } from "@/lib/db/audit-log";

// GET /api/admin/audit — the live ring buffer and the durable rows (admin+).
export const GET = defineRoute(
  { name: "admin/audit", access: { staff: "admin" }, rateLimit: adminApiRateLimit },
  async () => {
    const logs = getRecentAuditLogs(200);

    // Not caught: an unreadable table is a 500, not an empty list that reads as "no records".
    const persisted = await listAuditRows(200);
    return NextResponse.json({ logs, persisted });
  },
);
