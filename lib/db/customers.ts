import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "./client";
import { hashPassword, passwordMatches } from "@/lib/auth/passwords";
import { conflict, forbidden, invalid, isUniqueViolation, notFound } from "@/lib/domain/errors";
import { hasRole } from "@/lib/domain/roles";
import { otpErrorMessage, verifyOtp } from "./otp-codes";
import type { CustomerActor, StaffActor } from "@/lib/domain/actor";

/**
 * Customer accounts — the `users` table. Staff are in ./staff.ts.
 *
 * A customer's mobile number is their identity: it is what signs in, what a
 * reset code is sent to, and what an advertiser is called back on. So an
 * account is only ever opened, or its password reset, on a number whose owner
 * answered a code sent to it.
 */

const PHONE_TAKEN = "این شماره قبلاً ثبت شده است";

/** A customer as a session sees them. The hash is never selected. */
export interface CustomerAccount { id: number; name: string; phone: string; sessionVersion: number }

const ACCOUNT_FIELDS = { id: true, name: true, phone: true, sessionVersion: true } as const;

/** One customer, for resolving a session — see resolveActor. */
export async function findCustomer(id: number): Promise<CustomerAccount | null> {
  return prisma.user.findUnique({ where: { id }, select: ACCOUNT_FIELDS });
}

/**
 * Every session this customer holds is signed out by raising their
 * sessionVersion; this is the write that goes with a new password.
 */
const SIGN_OUT_EVERYWHERE = { sessionVersion: { increment: 1 } } as const;

export async function isPhoneRegistered(phone: string): Promise<boolean> {
  return (await prisma.user.count({ where: { phone } })) > 0;
}

/**
 * The customer these credentials open, or null. Costs the same bcrypt
 * comparison whether or not the number is registered (see passwordMatches), so
 * response time cannot be used to enumerate accounts.
 */
export async function verifyCustomerCredentials(phone: string, password: string): Promise<CustomerAccount | null> {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!(await passwordMatches(password, user?.passwordHash))) return null;
  return { id: user!.id, name: user!.name, phone: user!.phone, sessionVersion: user!.sessionVersion };
}

/**
 * Open an account on a verified number.
 *
 * The code is spent here, after the caller has already checked the number is
 * free: a code is single-use, and burning it to tell someone a number they
 * cannot have is taken would make them ask for a fresh one before they could
 * try another. The unique index on `phone` still has the last word if two
 * sign-ups race.
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
 * every other session; the caller re-issues this one from the returned account.
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

  return prisma.user.update({
    where: { id: self.id },
    data: {
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.newPassword ? { passwordHash: await hashPassword(patch.newPassword), ...SIGN_OUT_EVERYWHERE } : {}),
    },
    select: ACCOUNT_FIELDS,
  });
}

/**
 * Finish a phone-verified password reset: spend the code, set the password,
 * and sign out every existing session — a reset is often the answer to "someone
 * else is in my account". One step, with no intermediate token to track.
 * Returns the account id for the audit record.
 */
export async function resetPasswordWithCode(phone: string, code: string, newPassword: string): Promise<number> {
  const check = await verifyOtp(phone, "password_reset", code);
  if (!check.ok) throw invalid(otpErrorMessage(check.reason));

  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  // The code was valid, so the account existed when it was issued; one that has
  // since vanished gets the same generic refusal as any other failure.
  if (!user) throw invalid("امکان تغییر رمز نیست");

  await prisma.user.update({
    where: { id: user.id },
    data:  { passwordHash: await hashPassword(newPassword), ...SIGN_OUT_EVERYWHERE },
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
 * Staff correct a customer's name or number. The unique index on `phone`
 * decides a clash — a read beforehand would let two edits slip between it and
 * the write — and a clash becomes a plain "already registered".
 *
 * Moving the number is super admin only. The number is where a reset code
 * goes, so whoever sets it to a phone they hold can then reset the password
 * and own the account. The form sends the number with every save, so only an
 * actual change is refused.
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
 * Staff set a new password for a customer — the one given, or a readable
 * random one — and get it back once to pass on. Existing sessions end. An existing password can never
 * be shown: it is only stored as a bcrypt hash.
 */
export async function setCustomerPassword(id: number, password?: string): Promise<string> {
  const exists = await prisma.user.count({ where: { id } });
  if (!exists) throw notFound("کاربر یافت نشد");

  const next = password ?? readablePassword();
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(next), ...SIGN_OUT_EVERYWHERE } });
  return next;
}
