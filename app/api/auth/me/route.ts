import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { userApiRateLimit, publicApiRateLimit } from "@/lib/rate-limit";
import { updateOwnProfile } from "@/lib/db/customers";
import { GivenPassword, NewPassword } from "@/lib/domain/password";

/**
 * GET /api/auth/me — who is signed in, staff included, so the public site
 * greets staff by name and `isStaff` gates what only the team sees.
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
