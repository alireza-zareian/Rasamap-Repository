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
  | "listing_approved"
  | "listing_rejected"
  | "listing_revision_requested"
  | "listing_resubmitted"
  | "admin_access"
  | "admin_user_create"
  | "admin_user_update"
  | "customer_update"
  | "lead_update"
  | "customer_password_reset"
  | "password_reset_self"
  | "otp_sent"
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

  await pruneOldAuditRows();
}

/** How far back the durable audit trail is kept. */
const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;   // 90 days

/**
 * Opportunistic prune, the same shape lib/idempotency.ts already uses: the
 * table is trimmed on the way past a write rather than by a scheduled job,
 * because this deployment has nowhere to schedule one.
 *
 * Without it `audit_logs` grows for the life of the deployment — every sign-in,
 * every listing decision, every lockout, kept for ever on a SQLite file sitting
 * next to the app. Ninety days is well past answering "who changed this, and
 * when", which is what the table is for.
 *
 * The sampling is what keeps this cheap: a DELETE on every audited action would
 * be a scan on every sign-in, and the rows being removed are three months old —
 * a few hours either way costs nothing.
 */
async function pruneOldAuditRows(): Promise<void> {
  if (Math.random() > 0.01) return;   // ~1 write in 100 does the work
  try {
    await prisma.auditLog.deleteMany({
      where: { timestamp: { lt: new Date(Date.now() - AUDIT_RETENTION_MS) } },
    });
  } catch {
    // Housekeeping, not the caller's problem — the row that mattered is written.
  }
}
