import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { isStaffRole } from "@/lib/domain/roles";
import { SESSION_IDLE_MS, SESSION_MAX_LIFETIME_MS } from "@/lib/domain/session";
import type { Actor } from "@/lib/domain/actor";

/**
 * One row per signed-in browser (§36). The cookie carries a random token and
 * the row is keyed by its SHA-256, so the table alone opens nothing. Signing
 * out deletes the row; one primary-key read answers who is asking. The two
 * lifetimes are in lib/domain/session.ts.
 */

/**
 * The value starts `s.` (staff) or `c.` (customer) so proxy.ts can route without
 * a database read. Only a hint: it is part of what is hashed, so a changed
 * prefix names no row, and every decision is made from the row.
 */
const PREFIX = { staff: "s", customer: "c" } as const;

export type AccountRef = { kind: "customer" | "staff"; id: number };

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Open a session for this account and return the cookie value. */
export async function createSession(account: AccountRef): Promise<string> {
  const value = `${PREFIX[account.kind]}.${randomBytes(32).toString("base64url")}`;
  await prisma.session.create({
    data: {
      id:        hashToken(value),
      kind:      account.kind,
      userId:    account.kind === "customer" ? account.id : null,
      adminId:   account.kind === "staff" ? account.id : null,
      expiresAt: new Date(Date.now() + SESSION_IDLE_MS),
    },
  });
  await pruneExpiredSessions();
  return value;
}

/**
 * The actor behind a cookie value, or null if the session is missing, expired
 * or a deactivated staff account's. Name and role are read on every request, so
 * a role change applies on the next click. Past half its idle window a session
 * is extended, never beyond its absolute lifetime — at most one write per four
 * hours. A database error throws rather than reading as "signed out".
 */
export async function findSessionActor(value: string): Promise<Actor | null> {
  const id = hashToken(value);
  const row = await prisma.session.findUnique({
    where:  { id },
    select: {
      kind: true, createdAt: true, expiresAt: true,
      user:  { select: { id: true, name: true, phone: true } },
      admin: { select: { id: true, name: true, email: true, role: true, active: true } },
    },
  });
  if (!row) return null;

  const now = Date.now();
  const hardEnd = row.createdAt.getTime() + SESSION_MAX_LIFETIME_MS;
  if (row.expiresAt.getTime() <= now || hardEnd <= now) return null;

  if (row.expiresAt.getTime() - now < SESSION_IDLE_MS / 2) {
    await prisma.session.update({ where: { id }, data: { expiresAt: new Date(Math.min(now + SESSION_IDLE_MS, hardEnd)) } });
  }

  if (row.kind === "customer") {
    return row.user ? { kind: "customer", sessionId: id, ...row.user } : null;
  }
  const staff = row.admin;
  if (!staff?.active) return null;
  return {
    kind: "staff", sessionId: id, id: staff.id, name: staff.name, email: staff.email,
    // An enum to Prisma, unchecked text to SQLite: an unknown value gets the least authority.
    role: isStaffRole(staff.role) ? staff.role : "viewer",
  };
}

/** Sign one browser out. Signing out twice is not an error. */
export async function deleteSession(value: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: hashToken(value) } });
}

/**
 * Sign an account out everywhere — a new password, a reset, a deactivation —
 * except, when given, the session that made the change. Pass the transaction
 * the change runs in, so the new password and the sign-out land together.
 */
export async function endSessionsOf(
  account: AccountRef,
  keepSessionId?: string,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  await db.session.deleteMany({
    where: {
      ...(account.kind === "customer" ? { userId: account.id } : { adminId: account.id }),
      ...(keepSessionId ? { NOT: { id: keepSessionId } } : {}),
    },
  });
}

/** Delete expired rows on one sign-in in fifty, as ./audit-log.ts does — only to bound the table. */
async function pruneExpiredSessions(): Promise<void> {
  if (Math.random() > 0.02) return;
  try {
    await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch {
    // Housekeeping; the sign-in that triggered it already succeeded.
  }
}
