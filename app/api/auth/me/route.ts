import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { userApiRateLimit, publicApiRateLimit } from "@/lib/rate-limit";
import { updateOwnProfile } from "@/lib/db/customers";
import { GivenPassword, NewPassword } from "@/lib/domain/password";

/**
 * GET /api/auth/me — who is signed in.
 *
 * Answers for a staff session too, not only a customer one: to the public site
 * an administrator is then not a stranger — their name is in the header and
 * they can answer a review. `isStaff` is what the site reads to decide whether
 * to offer the things only the team should see.
 *
 * Keeping the session alive needs nothing here any more: every request that
 * resolves it pushes its idle limit forward (lib/db/sessions.ts).
 */
export const GET = defineRoute(
  { name: "auth/me", access: "signed-in", rateLimit: publicApiRateLimit },
  async ({ actor }) => {
    const isStaff = actor.kind === "staff";
    return NextResponse.json({
      user: {
        id:    String(actor.id),
        name:  actor.name,
        phone: isStaff ? "" : actor.phone,
        email: isStaff ? actor.email : "",
        role:  isStaff ? actor.role : "user",
        isStaff,
      },
    });
  },
);

// PATCH /api/auth/me — a customer updates their name and/or password. A new
// password signs out every other browser of the account; this one stays.
export const PATCH = defineRoute(
  {
    name: "auth/me",
    access: "customer",
    rateLimit: userApiRateLimit,
    body: z.object({
      name:            z.string().min(2).max(100).trim().optional(),
      currentPassword: GivenPassword.optional(),
      newPassword:     NewPassword.optional(),
    })
      .refine(d => !(d.newPassword && !d.currentPassword), { message: "برای تغییر رمز، رمز فعلی لازم است" })
      .refine(d => d.name || d.newPassword, { message: "هیچ تغییری ارائه نشده است" }),
  },
  async ({ actor, body }) => {
    const account = await updateOwnProfile(actor, body);
    return NextResponse.json({ user: { id: account.id, name: account.name, phone: account.phone } });
  },
);
