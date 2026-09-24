import "server-only";
import { cache } from "react";
import type { NextRequest, NextResponse } from "next/server";
import { buildSessionCookieHeader, createSession, getSession, type Session, type SessionClaims } from "./session";
import { findActiveStaff } from "@/lib/db/staff";
import type { StaffRole } from "@/lib/domain/roles";

/**
 * Who is making this request — the one identity every route and page reasons
 * about, instead of the raw token.
 *
 * `id` is a number, already parsed, and `kind` says which table it belongs to,
 * so a customer id can never be written into a staff column or the reverse.
 */
export interface CustomerActor {
  kind:  "customer";
  id:    number;
  name:  string;
  phone: string;
}

export interface StaffActor {
  kind:  "staff";
  id:    number;
  name:  string;
  email: string;
  role:  StaffRole;
}

export type Actor = CustomerActor | StaffActor;

/**
 * Turn a verified token into an actor.
 *
 * A JWT is a signed statement about who someone was when they signed in, and it
 * stays true for the whole eight hours — which is the wrong answer to "this
 * administrator was deactivated a minute ago". So a staff token is confirmed
 * against its row before it is trusted: a deleted or deactivated account is no
 * actor at all, and the role that counts is the one in the database rather than
 * the one in the token, so a demotion takes effect on the next request instead
 * of the next sign-in.
 *
 * Customers are deliberately not looked up. A customer session carries no
 * authority beyond "signed in", there is nothing to revoke short of deleting the
 * account, and this runs on public pages — a query per visitor would buy
 * nothing. The staff lookup measures 0.05 ms and only staff pay it.
 *
 * A database failure is left to throw rather than converted into "signed out":
 * answering that would sign an administrator out of a working panel over a
 * transient error, where a 500 with a reference id tells them to retry.
 */
export async function resolveActor(session: Session | null): Promise<Actor | null> {
  if (!session) return null;
  const id = Number(session.sub);

  if (session.kind === "customer") {
    return { kind: "customer", id, name: session.name, phone: session.phone };
  }

  const account = await findActiveStaff(id);
  if (!account) return null;
  return { kind: "staff", id, name: account.name, email: account.email, role: account.role };
}

/**
 * The actor for the current request. Wrapped in React's `cache` so a page whose
 * layout and body both ask pays for one staff lookup, not two.
 */
export const getActor = cache(async (): Promise<Actor | null> => resolveActor(await getSession()));

/** What a session token for this actor asserts — see SessionClaims. */
export function claimsFor(actor: Actor): SessionClaims {
  return actor.kind === "customer"
    ? { kind: "customer", sub: String(actor.id), name: actor.name, phone: actor.phone }
    : { kind: "staff", sub: String(actor.id), name: actor.name, email: actor.email, role: actor.role };
}

/** Sign `actor` in on this response: a fresh token in the session cookie. */
export async function startSession(res: NextResponse, actor: Actor, req: NextRequest): Promise<NextResponse> {
  res.headers.set("Set-Cookie", buildSessionCookieHeader(await createSession(claimsFor(actor)), req));
  return res;
}
