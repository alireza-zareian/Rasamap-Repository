import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./client";

/** How far back the durable audit trail is kept. */
const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;   // 90 days

export interface AuditRowInput {
  action:    string;
  severity:  "info" | "warn" | "critical";
  /** A staff actor's account — a real foreign key into `admins`. */
  adminId:   number | null;
  userEmail: string | null;
  ip:        string | null;
  userAgent: string | null;
  details:   Record<string, unknown>;
}

export async function insertAuditRow(row: AuditRowInput): Promise<void> {
  await prisma.auditLog.create({ data: { ...row, details: row.details as Prisma.InputJsonObject } });
  await pruneOldAuditRows();
}

export function listAuditRows(limit: number) {
  return prisma.auditLog.findMany({ orderBy: { timestamp: "desc" }, take: limit });
}

/**
 * Opportunistic prune, the same shape ./idempotency.ts uses: the table is
 * trimmed on the way past a write rather than by a scheduled job, because this
 * deployment has nowhere to schedule one.
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
