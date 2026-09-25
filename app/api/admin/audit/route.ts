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

    // The durable rows survive a restart, unlike the buffer. If the table
    // cannot be read, the live view is still worth showing rather than a 500.
    // Not caught: an unreadable audit table used to come back as an empty list,
    // which the panel showed as "no records yet". It is a 500 with a reference
    // id now, and the panel says it could not read the log.
    const persisted = await listAuditRows(200);
    return NextResponse.json({ logs, persisted });
  },
);
