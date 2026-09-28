import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { otpVerifyRateLimit, resetAccountAttempts } from "@/lib/rate-limit";
import { resetPasswordWithCode } from "@/lib/db/customers";
import { NewPassword } from "@/lib/domain/password";
import { MobileNumber } from "@/lib/domain/phone";

// POST /api/auth/otp/verify — finish a phone-verified password reset (public).
export const POST = defineRoute(
  {
    name: "auth/otp/verify",
    access: "public",
    rateLimit: { afterBody: b => otpVerifyRateLimit(b.phone) },
    body: z.object({
      phone:       MobileNumber(),
      purpose:     z.literal("password_reset"),
      code:        z.string().regex(/^\d{6}$/, "کد باید ۶ رقم باشد"),
      newPassword: NewPassword,
    }),
  },
  async ({ body, audit }) => {
    const customerId = await resetPasswordWithCode(body.phone, body.code, body.newPassword);

    // Clear the sign-in failures: guessing is how people arrive at a reset, and
    // a lockout after proving the phone would protect nothing.
    await resetAccountAttempts("user_login", body.phone);

    await audit("password_reset_self", {
      severity: "warn",
      details: { userId: customerId, via: "otp" },
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  },
);
