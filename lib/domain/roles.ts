/**
 * Staff roles, lowest to highest. A customer is another kind of account
 * (Actor, ./actor.ts), not the bottom rung. No I/O, so the panel's role picker
 * can import it.
 */
export const STAFF_ROLES = ["viewer", "editor", "admin", "super_admin"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

const RANK: Record<StaffRole, number> = { viewer: 1, editor: 2, admin: 3, super_admin: 4 };

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

/** Does `role` carry at least the authority of `required`? */
export function hasRole(role: StaffRole, required: StaffRole): boolean {
  return RANK[role] >= RANK[required];
}
