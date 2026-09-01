/**
 * RASAMAP — Audit Log
 *
 * Logs sensitive actions with user, timestamp, IP and details.
 * Currently writes to console (structured JSON) and an in-memory ring buffer.
 * Production: pipe to a persistent store (DB table, CloudWatch, Datadog, etc.)
 */

export type AuditAction =
  | "login_success"
  | "login_failure"
  | "logout"
  | "billboard_update"
  | "billboard_delete"
  | "scraper_trigger"
  | "geocode_trigger"
  | "admin_access"
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

  // Structured console output (capture by log aggregators)
  const fn = severity === "critical" ? console.error
           : severity === "warn"     ? console.warn
           : console.log;
  fn(JSON.stringify({ type: "AUDIT", ...entry }));
}

export function getRecentAuditLogs(limit = 100): AuditEntry[] {
  return [...LOG_BUFFER].reverse().slice(0, limit);
}
