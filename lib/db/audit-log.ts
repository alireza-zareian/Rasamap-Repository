import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./client";

/** How far back the durable audit trail is kept. */
const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;   // 90 days

export interface AuditRowInput {
  action:    string;
  severity:  "info" | "warn" | "critical";
  /** The actor, as a real foreign key into its own table — or neither. */
  adminId:   number | null;
  userId:    number | null;
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
 * Trim rows past 90 days on the way past a write, since there is no scheduler.
 * Sampled, so not every sign-in pays for a DELETE; for rows three months old a
 * few hours either way costs nothing.
 */
async function pruneOldAuditRows(): Promise<void> {
  if (Math.random() > 0.01) return;   // ~1 write in 100 does the work
  try {
    await prisma.auditLog.deleteMany({
      where: { timestamp: { lt: new Date(Date.now() - AUDIT_RETENTION_MS) } },
    });
  } catch {
    // Housekeeping; the row that mattered is written.
  }
}
