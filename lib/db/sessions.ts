import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { isStaffRole } from "@/lib/domain/roles";
import { SESSION_IDLE_MS, SESSION_MAX_LIFETIME_MS } from "@/lib/domain/session";
import type { Actor } from "@/lib/domain/actor";

/**
 * Sessions — the `sessions` table. One row per signed-in browser.
 *
 * The cookie carries a random token; the row is keyed by its SHA-256, so the
 * table on its own opens nothing. This replaced a signed JWT that every request
 * still had to check against the database twice (a revocation list and a
 * per-account version number): the JWT's one advantage, needing no lookup, was
 * already gone, and what was left was the machinery around it. Here the row
 * *is* the session: signing out deletes it, signing an account out everywhere
 * deletes all of its rows, and one primary-key read answers who is asking.
 *
 * The two lifetimes it enforces are in lib/domain/session.ts.
 */

/**
 * The cookie value starts with the kind of account — `s.` for staff, `c.` for a
 * customer — so proxy.ts can route a request (sign-in page or 403) without a
 * database read. That prefix is a hint and nothing more: it is part of what is
 * hashed, so changing it names a row that does not exist, and every real
 * decision is made from the row.
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
 * The account behind a cookie value, as an actor, or null when the session is
 * missing, expired, or belongs to a deactivated staff account.
 *
 * The name, number and role are read from the account row on every request,
 * so a role changed by a super admin applies on the next click. A session past
 * half its idle window is extended here, never beyond its absolute lifetime —
 * at most one write per session every four hours.
 *
 * A database failure is left to throw rather than read as "signed out", which
 * would sign someone out over a transient error.
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
    // The column is an enum, but a value outside the ladder is still treated as
    // the least authority rather than trusted.
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

/**
 * Opportunistic prune, as ./idempotency.ts and ./audit-log.ts do: an expired
 * row is refused on read anyway, so this only keeps the table from growing.
 * One sign-in in fifty does the work.
 */
async function pruneExpiredSessions(): Promise<void> {
  if (Math.random() > 0.02) return;
  try {
    await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch {
    // Housekeeping; the sign-in that triggered it already succeeded.
  }
}
