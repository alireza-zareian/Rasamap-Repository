import "server-only";
import { prisma } from "./client";
import { hashPassword, passwordMatches } from "@/lib/auth/passwords";
import { conflict, isUniqueViolation, notFound } from "@/lib/domain/errors";
import { isStaffRole, type StaffRole } from "@/lib/domain/roles";

/**
 * Staff accounts — the `admins` table. Customers are in ./customers.ts.
 *
 * The two are kept apart on purpose, the way most products separate workforce
 * accounts from customer accounts: they sign in with different identifiers
 * (email vs mobile), carry different authority, and a customer can never be
 * promoted into the panel by editing a column. What was wrong was never the two
 * tables — it was a session that did not say which one it pointed into. See
 * SessionClaims in lib/auth/session.ts.
 */

export interface StaffAccount {
  id:     number;
  email:  string;
  name:   string;
  role:   StaffRole;
  active: boolean;
  createdAt: Date;
}

const PUBLIC_FIELDS = { id: true, email: true, name: true, role: true, active: true, createdAt: true } as const;

/** A staff account as a session needs it: the public fields and the session counter. */
export type StaffSessionAccount = StaffAccount & { sessionVersion: number };
const SESSION_FIELDS = { ...PUBLIC_FIELDS, sessionVersion: true } as const;

/** Field by field, so nothing else the row was read with — a hash — rides along. */
function toAccount(row: { id: number; email: string; name: string; role: string; active: boolean; createdAt: Date }): StaffAccount {
  return {
    id:        row.id,
    email:     row.email,
    name:      row.name,
    // The column is free text in SQLite; a value outside the ladder is treated
    // as the least authority rather than trusted, so a hand-edited row cannot
    // grant more than it names.
    role:      isStaffRole(row.role) ? row.role : "viewer",
    active:    row.active,
    createdAt: row.createdAt,
  };
}

/** An active staff account, or null if it is gone or deactivated. */
export async function findActiveStaff(id: number): Promise<StaffSessionAccount | null> {
  const row = await prisma.admin.findUnique({ where: { id }, select: SESSION_FIELDS });
  return row && row.active ? { ...toAccount(row), sessionVersion: row.sessionVersion } : null;
}

/**
 * The staff account these credentials open, or null. Costs the same bcrypt
 * comparison whether or not the email exists (see passwordMatches).
 */
export async function verifyStaffCredentials(email: string, password: string): Promise<StaffSessionAccount | null> {
  const row = await prisma.admin.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { ...SESSION_FIELDS, passwordHash: true },
  });
  const usable = row?.active ? row : null;
  if (!usable || !(await passwordMatches(password, usable.passwordHash))) {
    // Still pay for a comparison when there is no usable account, so the two
    // refusals cost the same.
    if (!usable) await passwordMatches(password, null);
    return null;
  }
  return { ...toAccount(usable), sessionVersion: usable.sessionVersion };
}

export async function listStaff(): Promise<StaffAccount[]> {
  const rows = await prisma.admin.findMany({ orderBy: { createdAt: "asc" }, select: PUBLIC_FIELDS });
  return rows.map(toAccount);
}

export async function createStaff(input: {
  email: string; name: string; role: StaffRole; password: string;
}): Promise<StaffAccount> {
  try {
    const row = await prisma.admin.create({
      data: {
        email: input.email, name: input.name, role: input.role,
        passwordHash: await hashPassword(input.password),
      },
      select: PUBLIC_FIELDS,
    });
    return toAccount(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("کاربری با این ایمیل از قبل وجود دارد");
    throw err;
  }
}

/**
 * Change another staff member's role or active flag.
 *
 * Refused on the caller's own account: a super admin who demotes or
 * deactivates themselves can leave the panel with nobody able to undo it.
 * Deactivating also ends the account's sessions, so reactivating it later does
 * not bring a token issued before the deactivation back to life.
 * Returns the account as it was and as it is, for the audit record.
 */
export async function updateStaff(
  actorId: number,
  id: number,
  patch: { role?: StaffRole; active?: boolean },
): Promise<{ before: StaffAccount; after: StaffAccount }> {
  if (id === actorId) throw conflict("نمی‌توانید نقش یا وضعیت حساب خودتان را تغییر دهید");

  const existing = await prisma.admin.findUnique({ where: { id }, select: PUBLIC_FIELDS });
  if (!existing) throw notFound("کاربر یافت نشد");

  const updated = await prisma.admin.update({
    where: { id },
    data: { ...patch, ...(patch.active === false ? { sessionVersion: { increment: 1 } } : {}) },
    select: PUBLIC_FIELDS,
  });
  return { before: toAccount(existing), after: toAccount(updated) };
}
