import "server-only";
import { cache } from "react";
import type { NextRequest, NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { buildSessionCookieHeader, createSession, getSession, type Session, type SessionClaims } from "./session";
import { findActiveStaff } from "@/lib/db/staff";
import { findCustomer } from "@/lib/db/customers";
import { isSessionRevoked } from "@/lib/db/sessions";
import type { Actor, CustomerActor, StaffActor } from "@/lib/domain/actor";

// The types live in lib/domain/actor.ts; re-exported so callers keep one import.
export type { Actor, CustomerActor, StaffActor };

/**
 * Turn a verified token into an actor.
 *
 * A JWT is a signed statement about who someone was when they signed in, and
 * on its own it stays true until it expires — through a password change, a
 * reset, a deactivation, a sign-out. So every token is confirmed against its
 * row: a missing or deactivated account is no actor, a token whose `ver` is
 * behind the row's sessionVersion was signed out everywhere, a token in
 * revoked_sessions was signed out on its own, and the name, number and role
 * that count are the ones in the database rather than the ones in the token.
 *
 * This used to skip customers, on the argument that a customer session carries
 * no authority worth revoking. It carries the account itself: without the
 * lookup a copied cookie outlived the victim's password change, and the
 * sliding refresh kept it alive indefinitely. The lookup is one primary-key
 * read, and only requests that carry a session pay it.
 *
 * A database failure is left to throw rather than converted into "signed out":
 * answering that would sign someone out over a transient error, where a 500
 * with a reference id tells them to retry.
 */
export async function resolveActor(session: Session | null): Promise<Actor | null> {
  if (!session) return null;
  const id = Number(session.sub);
  if (await isSessionRevoked(session.jti)) return null;

  if (session.kind === "customer") {
    const account = await findCustomer(id);
    if (!account || account.sessionVersion !== session.ver) return null;
    return { kind: "customer", ...account };
  }

  const account = await findActiveStaff(id);
  if (!account || account.sessionVersion !== session.ver) return null;
  return {
    kind: "staff", id, name: account.name, email: account.email,
    role: account.role, sessionVersion: account.sessionVersion,
  };
}

/**
 * The actor for the current request. Wrapped in React's `cache` so a page whose
 * layout and body both ask pays for one staff lookup, not two.
 */
export const getActor = cache(async (): Promise<Actor | null> => resolveActor(await getSession()));

/**
 * What a session token for this actor asserts — see SessionClaims.
 * `authTime` is when they signed in: now for a sign-in, the old token's value
 * for a refresh, so a refresh can never extend how long one sign-in lasts.
 */
export function claimsFor(actor: Actor, authTime: number): SessionClaims {
  const common = { sub: String(actor.id), name: actor.name, ver: actor.sessionVersion, auth_time: authTime };
  return actor.kind === "customer"
    ? { kind: "customer", ...common, phone: actor.phone }
    : { kind: "staff", ...common, email: actor.email, role: actor.role };
}

/**
 * Sign `actor` in on this response: a fresh token in the session cookie.
 * Pass the current token's `auth_time` when re-issuing rather than signing in.
 */
export async function startSession(
  res: NextResponse,
  actor: Actor,
  req: NextRequest,
  authTime: number = Math.floor(Date.now() / 1000),
): Promise<NextResponse> {
  // append, not set: a sign-in also hands out the device cookie (lib/auth/device.ts).
  res.headers.append("Set-Cookie", buildSessionCookieHeader(await createSession(claimsFor(actor, authTime)), req));
  return res;
}

/**
 * The staff member viewing a panel page, or a redirect to sign in.
 *
 * proxy.ts has already turned away anyone without a staff token; this is the
 * check that reads the account, so a deactivated one is sent to sign in rather
 * than shown a panel in which every request would then fail.
 */
export async function requireStaff(): Promise<StaffActor> {
  const actor = await getActor();
  if (actor?.kind !== "staff") redirect("/admin/login");
  return actor;
}
