import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { startSession } from "@/lib/auth/actor";
import { getSession, MAX_SESSION_LIFETIME_SECS } from "@/lib/auth/session";
import { userApiRateLimit, publicApiRateLimit } from "@/lib/rate-limit";
import { updateOwnProfile } from "@/lib/db/customers";

const TWO_HOURS = 2 * 60 * 60; // seconds

/**
 * GET /api/auth/me — who is signed in, plus a sliding session refresh.
 *
 * Answers for a staff session too, not only a customer one: to the public site
 * an administrator is then not a stranger — their name is in the header and
 * they can answer a review. `isStaff` is what the site reads to decide whether
 * to offer the things only the team should see.
 *
 * The refreshed token is minted from the actor, not copied from the old token,
 * so a staff member's current role and name — read from their row — are what
 * the new eight hours carry, and a deactivated account (no actor) cannot keep
 * itself alive by loading a page every few hours. The refresh keeps the
 * original sign-in time and stops once MAX_SESSION_LIFETIME_SECS has passed.
 */
export const GET = defineRoute(
  { name: "auth/me", access: "signed-in", rateLimit: publicApiRateLimit },
  async ({ req, actor }) => {
    const isStaff = actor.kind === "staff";
    const res = NextResponse.json({
      user: {
        id:    String(actor.id),
        name:  actor.name,
        phone: isStaff ? "" : actor.phone,
        email: isStaff ? actor.email : "",
        role:  isStaff ? actor.role : "user",
        isStaff,
      },
    });

    const session = await getSession();
    const now = Math.floor(Date.now() / 1000);
    if (session && session.exp - now < TWO_HOURS && now - session.auth_time < MAX_SESSION_LIFETIME_SECS) {
      await startSession(res, actor, req, session.auth_time);
    }
    return res;
  },
);

// PATCH /api/auth/me — a customer updates their name and/or password.
export const PATCH = defineRoute(
  {
    name: "auth/me",
    access: "customer",
    rateLimit: userApiRateLimit,
    body: z.object({
      name:            z.string().min(2).max(100).trim().optional(),
      currentPassword: z.string().min(1).max(128).optional(),
      newPassword:     z.string().min(6).max(128).optional(),
    })
      .refine(d => !(d.newPassword && !d.currentPassword), { message: "برای تغییر رمز، رمز فعلی لازم است" })
      .refine(d => d.name || d.newPassword, { message: "هیچ تغییری ارائه نشده است" }),
  },
  async ({ req, actor, body }) => {
    const account = await updateOwnProfile(actor, body);
    const res = NextResponse.json({ user: { id: account.id, name: account.name, phone: account.phone } });
    // A new password raised the account's sessionVersion, which signed out every
    // session including this one, so this device gets a token at the new version
    // (and, having just proved the password, a fresh sign-in time). A rename
    // re-issues too, since the name travels in the token, but keeps the old time.
    const session = await getSession();
    const authTime = body.newPassword ? undefined : session?.auth_time;
    return startSession(res, { kind: "customer", ...account }, req, authTime);
  },
);
