/**
 * Staff roles, lowest to highest. A customer has no role: being a customer is
 * a different kind of account (see Actor in lib/auth/actor.ts), not the bottom
 * rung of this ladder — which is what the old `role: "user"` pretended, and why
 * every staff check had to remember to exclude it by hand.
 *
 * Data-free and I/O-free, so the admin panel can import it for its role picker.
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
