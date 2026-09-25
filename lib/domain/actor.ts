import type { StaffRole } from "./roles";

/**
 * Who is making a request — the identity every route, page and data-layer
 * function reasons about, instead of a raw token. Resolved from the session by
 * lib/auth/actor.ts.
 *
 * `id` is a number, already parsed, and `kind` says which table it belongs to,
 * so a customer id can never be written into a staff column or the reverse.
 *
 * The types live here, apart from the code that resolves them, because the
 * data layer needs the types while the resolver needs the data layer: kept in
 * one file they made lib/auth/actor.ts and lib/db/{customers,staff}.ts import
 * each other, a cycle in the graph §34 measures to be acyclic.
 */
export interface CustomerActor {
  kind:  "customer";
  id:    number;
  name:  string;
  phone: string;
  sessionVersion: number;
}

export interface StaffActor {
  kind:  "staff";
  id:    number;
  name:  string;
  email: string;
  role:  StaffRole;
  sessionVersion: number;
}

export type Actor = CustomerActor | StaffActor;
