import "server-only";
import { prisma } from "./client";
import { endSessionsOf } from "./sessions";
import { hashPassword, passwordMatches } from "@/lib/auth/passwords";
import { conflict, invalid, isUniqueViolation, notFound } from "@/lib/domain/errors";
import { isStaffRole, type StaffRole } from "@/lib/domain/roles";
import type { StaffActor } from "@/lib/domain/actor";

/**
 * Staff accounts — the `admins` table. Customers are in ./customers.ts.
 *
 * The two are kept apart on purpose, the way most products separate workforce
 * accounts from customer accounts: they sign in with different identifiers
 * (email vs mobile), carry different authority, and a customer can never be
 * promoted into the panel by editing a column. What was wrong was never the two
 * tables — it was a session that did not say which one it pointed into. A
 * session row now names its table in `kind` (lib/db/sessions.ts).
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

/**
 * The staff account these credentials open, or null. Costs the same bcrypt
 * comparison whether or not the email exists (see passwordMatches).
 */
export async function verifyStaffCredentials(email: string, password: string): Promise<StaffAccount | null> {
  const row = await prisma.admin.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { ...PUBLIC_FIELDS, passwordHash: true },
  });
  const usable = row?.active ? row : null;
  if (!usable || !(await passwordMatches(password, usable.passwordHash))) {
    // Still pay for a comparison when there is no usable account, so the two
    // refusals cost the same.
    if (!usable) await passwordMatches(password, null);
    return null;
  }
  return toAccount(usable);
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
 * not bring a browser signed in before the deactivation back to life.
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

  const updated = await prisma.$transaction(async tx => {
    const row = await tx.admin.update({ where: { id }, data: patch, select: PUBLIC_FIELDS });
    if (patch.active === false) await endSessionsOf({ kind: "staff", id }, undefined, tx);
    return row;
  });
  return { before: toAccount(existing), after: toAccount(updated) };
}

/**
 * A staff member changes their own password. Every other session of the
 * account ends; this one stays. There was no way to do this at all before — a
 * leaked staff password could only be answered by deactivating the account.
 */
export async function changeOwnStaffPassword(
  self: StaffActor,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const row = await prisma.admin.findUnique({ where: { id: self.id }, select: { passwordHash: true, active: true } });
  if (!row?.active) throw notFound("کاربر یافت نشد");
  if (!(await passwordMatches(currentPassword, row.passwordHash))) throw invalid("رمز فعلی اشتباه است");

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async tx => {
    await tx.admin.update({ where: { id: self.id }, data: { passwordHash } });
    await endSessionsOf(self, self.sessionId, tx);
  });
}
