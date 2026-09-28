import "server-only";
import { insertAuditRow } from "@/lib/db/audit-log";
import { logger } from "@/lib/logger";

/**
 * Two records of who did what:
 *
 *   auditLog()     — a log line and a 500-entry in-memory ring buffer; cheap
 *                    enough for every repeated 429, so a flood is not a flood
 *                    of rows. The buffer is per process: the panel's live view.
 *   recordAudit()  — the same plus a row in `audit_logs`, for what someone must
 *                    answer for later: an edit, a decision, a sign-in, a lockout.
 */

export type AuditAction =
  | "login_success"
  | "login_failure"
  | "logout"
  | "billboard_create"
  | "billboard_update"
  | "billboard_images_update"
  | "billboard_delete"
  | "billboard_suspended"
  | "billboard_restored"
  | "listing_approved"
  | "listing_rejected"
  | "listing_revision_requested"
  | "listing_resubmitted"
  | "admin_user_create"
  | "admin_user_update"
  | "customer_update"
  | "lead_update"
  | "customer_password_reset"
  | "admin_password_change"
  | "password_reset_self"
  | "otp_sent"
  | "rate_limit_hit"
  | "review_delete";

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

  // Through the shared logger, so audit lines also reach LOG_DIR/app.log.
  const level = severity === "critical" ? "error" : severity === "warn" ? "warn" : "info";
  logger[level]("audit", { audit: true, ...entry });
}

export function getRecentAuditLogs(limit = 100): AuditEntry[] {
  return [...LOG_BUFFER].reverse().slice(0, limit);
}

/** Who did it: an Actor fits, and so does an account that has just signed in. */
export type AuditActor = { kind: "customer"; id: number } | { kind: "staff"; id: number; email: string };

/**
 * Persist an action to `audit_logs` and mirror it to the log. The actor
 * becomes a foreign key into its own table (`adminId` or `userId`). A failed
 * write is logged and swallowed: recording must never break the action itself.
 */
export async function recordAudit(
  action: AuditAction,
  ctx: {
    actor?:     AuditActor | null;
    ip?:        string | null;
    userAgent?: string | null;
    severity?:  AuditEntry["severity"];
    details?:   Record<string, unknown>;
  },
): Promise<void> {
  const { actor = null, severity = "info" } = ctx;
  const details = ctx.details ?? {};
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
      userId:    actor?.kind === "customer" ? actor.id : null,
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
