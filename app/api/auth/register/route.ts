import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { startSession } from "@/lib/auth/actor";
import { registrationRateLimit, otpVerifyRateLimit } from "@/lib/rate-limit";
import { isPhoneRegistered, registerCustomer } from "@/lib/db/customers";
import { conflict } from "@/lib/domain/errors";
import { sendSms } from "@/lib/sms";

// An account is opened only on a number whose owner answered a code sent to it.
// The number is the identity here — it is what signs in, what a reset is sent
// to, and what an advertiser is called back on — so a sign-up that never proves
// it is a sign-up that lets anyone mint accounts on other people's numbers.
export const POST = defineRoute(
  {
    name: "auth/register",
    access: "public",
    rateLimit: registrationRateLimit,
    body: z.object({
      name:     z.string().min(2).max(100).trim(),
      phone:    z.string().regex(/^09[0-9]{9}$/, "شماره موبایل معتبر نیست"),
      password: z.string().min(6).max(128),
      code:     z.string().regex(/^\d{6}$/, "کد تأیید باید ۶ رقم باشد"),
    }),
  },
  async ({ req, body, tooMany }) => {
    // Before the code is looked at: a code is single-use, and spending it only
    // to say the number is taken would force a fresh one for the next attempt.
    if (await isPhoneRegistered(body.phone)) throw conflict("این شماره قبلاً ثبت شده است");

    const codeRl = await otpVerifyRateLimit(body.phone);
    if (!codeRl.allowed) return tooMany(codeRl);

    const customer = await registerCustomer(body);

    // Welcome SMS — fire-and-forget, a no-op unless KAVENEGAR_API_KEY is set,
    // and never allowed to fail the registration.
    void sendSms(customer.phone, "به رسامپ خوش آمدید. حساب کاربری شما با موفقیت ساخته شد.");

    return startSession(NextResponse.json({ ok: true, user: customer }), { kind: "customer", ...customer }, req);
  },
);
