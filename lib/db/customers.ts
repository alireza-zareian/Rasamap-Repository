import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "./client";
import { hashPassword, passwordMatches } from "@/lib/auth/passwords";
import { conflict, forbidden, invalid, isUniqueViolation, notFound } from "@/lib/domain/errors";
import { hasRole } from "@/lib/domain/roles";
import { otpErrorMessage, verifyOtp } from "./otp-codes";
import { endSessionsOf } from "./sessions";
import type { CustomerActor, StaffActor } from "@/lib/domain/actor";

/**
 * Customer accounts (`users`); staff are in ./staff.ts. The mobile number is
 * the identity — it signs in and receives reset codes — so an account is opened
 * or reset only on a number that answered a code sent to it.
 */

const PHONE_TAKEN = "این شماره قبلاً ثبت شده است";

/** A customer as a session sees them. The hash is never selected. */
export interface CustomerAccount { id: number; name: string; phone: string }

const ACCOUNT_FIELDS = { id: true, name: true, phone: true } as const;

export async function isPhoneRegistered(phone: string): Promise<boolean> {
  return (await prisma.user.count({ where: { phone } })) > 0;
}

/**
 * The customer these credentials open, or null. One bcrypt comparison either
 * way (passwordMatches), so timing does not reveal registered numbers.
 */
export async function verifyCustomerCredentials(phone: string, password: string): Promise<CustomerAccount | null> {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!(await passwordMatches(password, user?.passwordHash))) return null;
  return { id: user!.id, name: user!.name, phone: user!.phone };
}

/**
 * Open an account on a verified number. The caller checks the number is free
 * first, so a single-use code is not spent on a refusal; the unique index on
 * `phone` decides if two sign-ups race.
 */
export async function registerCustomer(input: {
  name: string; phone: string; password: string; code: string;
}): Promise<CustomerAccount> {
  const check = await verifyOtp(input.phone, "register", input.code);
  if (!check.ok) throw invalid(otpErrorMessage(check.reason));

  try {
    return await prisma.user.create({
      data: { name: input.name, phone: input.phone, passwordHash: await hashPassword(input.password) },
      select: ACCOUNT_FIELDS,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(PHONE_TAKEN);
    throw err;
  }
}

/**
 * A customer changes their own name and/or password. A new password signs out
 * every other session, in the same transaction; this one stays.
 */
export async function updateOwnProfile(
  self: CustomerActor,
  patch: { name?: string; currentPassword?: string; newPassword?: string },
): Promise<CustomerAccount> {
  const existing = await prisma.user.findUnique({ where: { id: self.id } });
  if (!existing) throw notFound("کاربر یافت نشد");

  if (patch.newPassword && !(await passwordMatches(patch.currentPassword ?? "", existing.passwordHash))) {
    throw invalid("رمز فعلی اشتباه است");
  }

  const passwordHash = patch.newPassword ? await hashPassword(patch.newPassword) : undefined;
  return prisma.$transaction(async tx => {
    const account = await tx.user.update({
      where: { id: self.id },
      data: { ...(patch.name ? { name: patch.name } : {}), ...(passwordHash ? { passwordHash } : {}) },
      select: ACCOUNT_FIELDS,
    });
    if (passwordHash) await endSessionsOf(self, self.sessionId, tx);
    return account;
  });
}

/**
 * A phone-verified password reset in one step: spend the code, set the
 * password, end every session (a reset often answers "someone else is in my
 * account"). Returns the account id for the audit row.
 */
export async function resetPasswordWithCode(phone: string, code: string, newPassword: string): Promise<number> {
  const check = await verifyOtp(phone, "password_reset", code);
  if (!check.ok) throw invalid(otpErrorMessage(check.reason));

  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  // Deleted since the code was issued: the same generic refusal as any failure.
  if (!user) throw invalid("امکان تغییر رمز نیست");

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await endSessionsOf({ kind: "customer", id: user.id }, undefined, tx);
  });
  return user.id;
}

// ── Staff-facing ────────────────────────────────────────────────────────────

const SORTS = {
  created_desc: { createdAt: "desc" },
  created_asc:  { createdAt: "asc" },
  name_asc:     { name: "asc" },
} as const;

export type CustomerSort = keyof typeof SORTS;
export const CUSTOMER_SORTS = Object.keys(SORTS) as [CustomerSort, ...CustomerSort[]];

/** The customer directory, searchable by name or number. */
export async function listCustomers(q: { search: string; sort: CustomerSort; page: number; limit: number }) {
  const where = q.search
    ? { OR: [{ name: { contains: q.search } }, { phone: { contains: q.search } }] }
    : {};

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: SORTS[q.sort],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: {
        id: true, name: true, phone: true, createdAt: true,
        _count: { select: { listings: true, reviews: true } },
      },
    }),
  ]);

  const users = rows.map(u => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    createdAt: u.createdAt,
    listingCount: u._count.listings,
    reviewCount: u._count.reviews,
  }));
  return { users, total, page: q.page, pages: Math.max(1, Math.ceil(total / q.limit)) };
}

/** One customer and the media they submitted. The password hash is never selected. */
export async function getCustomer(id: number) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, phone: true, createdAt: true,
      listings: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, name: true, city: true, moderation: true, availability: true, plan: true,
          featured: true, price: true, createdAt: true,
        },
      },
      _count: { select: { listings: true, reviews: true } },
    },
  });
  if (!user) throw notFound("کاربر یافت نشد");
  return user;
}

/**
 * Staff correct a customer's name or number; the unique index on `phone`
 * decides a clash. Changing the number is super admin only: whoever sets it to
 * a phone they hold can reset the password and own the account. The form
 * always sends the number, so only an actual change is refused.
 */
export async function updateCustomer(actor: StaffActor, id: number, patch: { name?: string; phone?: string }) {
  const before = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, phone: true } });
  if (!before) throw notFound("کاربر یافت نشد");
  if (patch.phone !== undefined && patch.phone !== before.phone && !hasRole(actor.role, "super_admin")) {
    throw forbidden("فقط سوپر ادمین می‌تواند شماره مشتری را تغییر دهد");
  }

  try {
    const after = await prisma.user.update({
      where: { id },
      data: patch,
      select: { id: true, name: true, phone: true, createdAt: true },
    });
    return { before, after };
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(PHONE_TAKEN);
    throw err;
  }
}

/** 9 url-safe characters without the ambiguous 0/O/l/1 — easy to read out loud. */
function readablePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(9);
  let out = "";
  for (let i = 0; i < 9; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/**
 * Staff set a customer's password — the one given, or a readable random one —
 * and get it back once to pass on. Existing sessions end. Stored only as a
 * bcrypt hash, so an existing password can never be shown.
 */
export async function setCustomerPassword(id: number, password?: string): Promise<string> {
  const exists = await prisma.user.count({ where: { id } });
  if (!exists) throw notFound("کاربر یافت نشد");

  const next = password ?? readablePassword();
  const passwordHash = await hashPassword(next);
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id }, data: { passwordHash } });
    await endSessionsOf({ kind: "customer", id }, undefined, tx);
  });
  return next;
}
