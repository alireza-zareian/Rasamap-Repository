import type { StaffRole } from "./roles";

/**
 * Who is making a request, as every route, page and data-layer function sees
 * it (resolved by lib/auth/actor.ts). `kind` names the table `id` belongs to,
 * so a customer id cannot land in a staff column. Kept apart from the resolver
 * to keep the import graph acyclic (§34).
 */
export interface CustomerActor {
  kind:  "customer";
  id:    number;
  name:  string;
  phone: string;
  /** The session this request arrived on — kept when the password changes. */
  sessionId: string;
}

export interface StaffActor {
  kind:  "staff";
  id:    number;
  name:  string;
  email: string;
  role:  StaffRole;
  sessionId: string;
}

export type Actor = CustomerActor | StaffActor;
