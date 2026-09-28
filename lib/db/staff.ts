import "server-only";
import { prisma } from "./client";
import { endSessionsOf } from "./sessions";
import { hashPassword, passwordMatches } from "@/lib/auth/passwords";
import { conflict, invalid, isUniqueViolation, notFound } from "@/lib/domain/errors";
import { isStaffRole, type StaffRole } from "@/lib/domain/roles";
import type { StaffActor } from "@/lib/domain/actor";

/**
 * Staff accounts (`admins`); customers are in ./customers.ts. Kept apart on
 * purpose: they sign in differently (email vs mobile), and no column edit can
 * promote a customer into the panel. A session names its table in `kind`.
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
    // An enum to Prisma, unchecked text to SQLite: a hand-edited value gets the least authority.
    role:      isStaffRole(row.role) ? row.role : "viewer",
    active:    row.active,
    createdAt: row.createdAt,
  };
}

/** The staff account these credentials open, or null — one bcrypt comparison either way. */
export async function verifyStaffCredentials(email: string, password: string): Promise<StaffAccount | null> {
  const row = await prisma.admin.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { ...PUBLIC_FIELDS, passwordHash: true },
  });
  const usable = row?.active ? row : null;
  if (!usable || !(await passwordMatches(password, usable.passwordHash))) {
    // No usable account still pays for a comparison, so both refusals take as long.
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
 * Change another staff member's role or active flag — never one's own, which
 * could leave nobody able to undo it. Deactivating ends the account's sessions,
 * so reactivating does not revive them. Returns before and after for the audit.
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

/** A staff member changes their own password; every other session of the account ends. */
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
