import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { getRecentAuditLogs } from "@/lib/audit";
import { listAuditRows } from "@/lib/db/audit-log";
import { logger } from "@/lib/logger";

// GET /api/admin/audit — the live ring buffer and the durable rows (admin+).
export const GET = defineRoute(
  { name: "admin/audit", access: { staff: "admin" }, rateLimit: adminApiRateLimit },
  async () => {
    const logs = getRecentAuditLogs(200);

    // The durable rows survive a restart, unlike the buffer. If the table
    // cannot be read, the live view is still worth showing rather than a 500.
    let persisted: unknown[] = [];
    try {
      persisted = await listAuditRows(200);
    } catch (err) {
      logger.error("admin/audit: durable rows unreadable", { error: String(err) });
    }
    return NextResponse.json({ logs, persisted });
  },
);
