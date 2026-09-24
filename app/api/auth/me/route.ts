import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { startSession } from "@/lib/auth/actor";
import { getSession } from "@/lib/auth/session";
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
 * itself alive by loading a page every few hours.
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
    if (session && session.exp - Math.floor(Date.now() / 1000) < TWO_HOURS) {
      await startSession(res, actor, req);
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
    const user = await updateOwnProfile(actor, body);
    const res = NextResponse.json({ user });
    // The name travels in the token, so a rename needs a fresh one.
    return startSession(res, { kind: "customer", ...user }, req);
  },
);
