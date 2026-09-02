import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import type { UserRole } from "./session";

export interface AdminUser {
  id:           string;
  email:        string;
  passwordHash: string;
  name:         string;
  role:         UserRole;
  active:       boolean;
}

const BCRYPT_ROUNDS = 12;

/**
 * Constant-time padding hash.
 *
 * When the account does not exist there is no stored hash to compare against,
 * so we compare the submitted password with this one instead: both branches
 * then cost the same ~250 ms and the response time no longer reveals whether
 * the phone/email is registered.
 *
 * It MUST be a real bcrypt hash at the same cost as the stored ones. bcryptjs
 * accepts a malformed hash without throwing but returns `false` immediately —
 * a placeholder string therefore compares in ~0 ms and silently defeats the
 * whole defence. This is a cost-12 hash of a discarded random string; nothing
 * can match it.
 */
export const TIMING_PAD_HASH = "$2a$12$b49u2ltoc8xEG0Tzpj17q.eyApurHQ6u1FLPkQkLN4jiJknzE79yO";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function toAdminUser(row: { id: number; email: string; passwordHash: string; name: string; role: string; active: boolean }): AdminUser {
  return {
    id:           row.id.toString(),
    email:        row.email,
    passwordHash: row.passwordHash,
    name:         row.name,
    role:         row.role as UserRole,
    active:       row.active,
  };
}

export async function findUserByEmail(email: string): Promise<AdminUser | null> {
  const admin = await prisma.admin.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (!admin || !admin.active) return null;
  return toAdminUser(admin);
}

export async function findUserById(id: string): Promise<AdminUser | null> {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;
  const admin = await prisma.admin.findUnique({ where: { id: numId } });
  if (!admin || !admin.active) return null;
  return toAdminUser(admin);
}

export async function validateCredentials(
  email: string,
  password: string,
): Promise<AdminUser | null> {
  const user = await findUserByEmail(email);
  if (!user) {
    await bcrypt.compare(password, TIMING_PAD_HASH);
    return null;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? user : null;
}

/** RBAC: check if a role has at least the minimum required permission */
const ROLE_RANK: Record<UserRole, number> = {
  user:        0,
  viewer:      1,
  editor:      2,
  admin:       3,
  super_admin: 4,
};

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole];
}
