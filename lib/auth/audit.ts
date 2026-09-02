/**
 * RASAMAP — Audit Log
 *
 * Logs sensitive actions with user, timestamp, IP and details.
 * Currently writes to console (structured JSON) and an in-memory ring buffer.
 * Production: pipe to a persistent store (DB table, CloudWatch, Datadog, etc.)
 */

import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";

export type AuditAction =
  | "login_success"
  | "login_failure"
  | "logout"
  | "billboard_create"
  | "billboard_update"
  | "billboard_delete"
  | "reservation_status_change"
  | "scraper_trigger"
  | "geocode_trigger"
  | "admin_access"
  | "admin_user_create"
  | "admin_user_update"
  | "customer_update"
  | "customer_password_reset"
  | "rate_limit_hit"
  | "auth_bypass_attempt";

export interface AuditEntry {
  id:         string;
  timestamp:  string;
  action:     AuditAction;
  userId?:    string;
  userEmail?: string;
  ip?:        string;
  userAgent?: string;
  details?:   Record<string, unknown>;
  severity:   "info" | "warn" | "critical";
}

// In-memory ring buffer (last 500 entries)
const LOG_BUFFER: AuditEntry[] = [];
const MAX_BUFFER = 500;

let counter = 0;

export function auditLog(
  action:  AuditAction,
  severity: AuditEntry["severity"],
  context: Omit<AuditEntry, "id" | "timestamp" | "action" | "severity">,
): void {
  const entry: AuditEntry = {
    id:        `audit_${Date.now()}_${++counter}`,
    timestamp: new Date().toISOString(),
    action,
    severity,
    ...context,
  };

  // Ring buffer
  if (LOG_BUFFER.length >= MAX_BUFFER) LOG_BUFFER.shift();
  LOG_BUFFER.push(entry);

  // Structured output via the shared logger, so audit lines also land in the
  // rotated LOG_DIR/app.log file (when LOG_DIR is set) and any log collector.
  const level = severity === "critical" ? "error" : severity === "warn" ? "warn" : "info";
  logger[level]("audit", { audit: true, ...entry });
}

export function getRecentAuditLogs(limit = 100): AuditEntry[] {
  return [...LOG_BUFFER].reverse().slice(0, limit);
}

/**
 * Persist a sensitive mutation to the `audit_logs` table so there is a durable
 * "who did what, and when" record that survives a restart (the ring buffer
 * above does not). Best-effort: a write failure is logged and swallowed — an
 * audit-write must never break the operation it is recording.
 */
export async function persistAudit(entry: {
  action: AuditAction;
  severity?: AuditEntry["severity"];
  adminId?: number | null;
  userEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  // Mirror to the in-memory buffer + structured console line too.
  auditLog(entry.action, entry.severity ?? "info", {
    userId: entry.adminId != null ? String(entry.adminId) : undefined,
    userEmail: entry.userEmail ?? undefined,
    ip: entry.ip ?? undefined,
    userAgent: entry.userAgent ?? undefined,
    details: entry.details,
  });

  try {
    // `adminId` is NOT written to the FK column: the admin identity comes from a
    // JWT (env-based admin) and usually has no `admins` row, which would trip the
    // foreign key. The numeric id is folded into `details.actorId` instead;
    // `userEmail` carries "who".
    const { adminId, ...restDetails } = { adminId: entry.adminId ?? null, ...(entry.details ?? {}) };
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        severity: entry.severity ?? "info",
        adminId: null,
        userEmail: entry.userEmail ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        details: { actorId: adminId, ...restDetails } as object,
      },
    });
  } catch (err) {
    logger.warn("persistAudit failed", {
      action: entry.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
