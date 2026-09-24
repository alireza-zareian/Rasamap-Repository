import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { otpVerifyRateLimit, resetAccountAttempts } from "@/lib/rate-limit";
import { resetPasswordWithCode } from "@/lib/db/customers";

// POST /api/auth/otp/verify — finish a phone-verified password reset (public).
export const POST = defineRoute(
  {
    name: "auth/otp/verify",
    access: "public",
    rateLimit: { afterBody: b => otpVerifyRateLimit(b.phone) },
    body: z.object({
      phone:       z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست"),
      purpose:     z.literal("password_reset"),
      code:        z.string().regex(/^\d{6}$/, "کد باید ۶ رقم باشد"),
      newPassword: z.string().min(6).max(128),
    }),
  },
  async ({ body, audit }) => {
    const customerId = await resetPasswordWithCode(body.phone, body.code, body.newPassword);

    // Clear the failed-sign-in budget for this account.
    //
    // Forgetting a password and guessing at it is the *normal* way to arrive
    // here, so by the time someone completes a reset their account has usually
    // spent most of its attempts. Leaving the count standing would meet them
    // with "this account is temporarily locked" holding the password they just
    // chose, through a phone code they just proved they control — a refusal
    // with no security left in it.
    await resetAccountAttempts("user_login", body.phone);

    await audit("password_reset_self", {
      severity: "warn",
      details: { userId: customerId, via: "otp" },
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  },
);
