import "server-only";
import { insertAuditRow } from "@/lib/db/audit-log";
import { logger } from "@/lib/logger";
import type { Actor } from "@/lib/auth/actor";

/**
 * RASAMAP — Audit Log
 *
 * Two records of who did what, kept for different reasons:
 *
 *   auditLog()     — a structured log line plus a 500-entry in-memory ring
 *                    buffer. Cheap enough to call on every failed sign-in and
 *                    every repeated 429, which is exactly why it is not durable:
 *                    a flood of those must not become a flood of rows.
 *   recordAudit()  — the same, plus a row in `audit_logs`. For the actions a
 *                    person will later need to answer for: an edit, a
 *                    decision, an account change, a lockout.
 *
 * The ring buffer is per process by design. It is the "what is happening right
 * now" view on the panel's live tab; the durable table is the record, and it is
 * shared by every instance because it is the database.
 */

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
 * Persist a sensitive action to `audit_logs`, and mirror it to the log and the
 * ring buffer. Best-effort: a write failure is logged and swallowed — recording
 * an action must never break the action it records.
 *
 * The actor is taken whole rather than as loose fields, so the row can carry a
 * staff account as a real foreign key and a customer as their id, instead of
 * every caller re-deriving both from a session by hand.
 */
export async function recordAudit(
  action: AuditAction,
  ctx: {
    actor?:     Actor | null;
    ip?:        string | null;
    userAgent?: string | null;
    severity?:  AuditEntry["severity"];
    details?:   Record<string, unknown>;
  },
): Promise<void> {
  const { actor = null, severity = "info" } = ctx;
  const details = {
    ...(actor?.kind === "customer" ? { customerId: actor.id } : {}),
    ...(ctx.details ?? {}),
  };
  const userEmail = actor?.kind === "staff" ? actor.email : null;

  auditLog(action, severity, {
    userId:    actor ? `${actor.kind}:${actor.id}` : undefined,
    userEmail: userEmail ?? undefined,
    ip:        ctx.ip ?? undefined,
    userAgent: ctx.userAgent ?? undefined,
    details,
  });

  try {
    await insertAuditRow({
      action,
      severity,
      adminId:   actor?.kind === "staff" ? actor.id : null,
      userEmail,
      ip:        ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      details,
    });
  } catch (err) {
    logger.warn("recordAudit failed", {
      action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
