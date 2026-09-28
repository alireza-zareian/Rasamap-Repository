import "server-only";
import { cache } from "react";
import type { NextRequest, NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { clearedSessionCookieHeader, readSessionToken, sessionCookieHeader } from "./session";
import { createSession, deleteSession, findSessionActor, type AccountRef } from "@/lib/db/sessions";
import type { Actor, CustomerActor, StaffActor } from "@/lib/domain/actor";

// The types live in lib/domain/actor.ts; re-exported so callers keep one import.
export type { Actor, CustomerActor, StaffActor };

/** The account behind this request's session cookie, or null — one lookup per request (React `cache`). */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = await readSessionToken();
  return token ? findSessionActor(token) : null;
});

/** Sign an account in on this response: a new session row and its cookie. */
export async function startSession(res: NextResponse, account: AccountRef, req: NextRequest): Promise<NextResponse> {
  // append, not set: a sign-in also hands out the device cookie (lib/auth/device.ts).
  res.headers.append("Set-Cookie", sessionCookieHeader(await createSession(account), req));
  return res;
}

/** Sign this browser out: delete its row, clear the cookie. Needs only the token. */
export async function endSession(res: NextResponse, req: NextRequest): Promise<NextResponse> {
  const token = await readSessionToken();
  if (token) await deleteSession(token);
  res.headers.set("Set-Cookie", clearedSessionCookieHeader(req));
  return res;
}

/**
 * The staff member viewing a panel page, or a redirect to sign in. proxy.ts
 * only routes on the cookie's claim; this reads the account.
 */
export async function requireStaff(): Promise<StaffActor> {
  const actor = await getActor();
  if (actor?.kind !== "staff") redirect("/login?as=staff");
  return actor;
}
