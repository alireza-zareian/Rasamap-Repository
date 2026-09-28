import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { startSession } from "@/lib/auth/actor";
import { registrationRateLimit, otpVerifyRateLimit } from "@/lib/rate-limit";
import { isPhoneRegistered, registerCustomer } from "@/lib/db/customers";
import { conflict } from "@/lib/domain/errors";
import { sendSms } from "@/lib/sms";
import { NewPassword } from "@/lib/domain/password";
import { MobileNumber } from "@/lib/domain/phone";

// An account opens only on a number that answered a code: the number is the
// identity, so an unproven one would let anyone open accounts on others' phones.
export const POST = defineRoute(
  {
    name: "auth/register",
    access: "public",
    rateLimit: registrationRateLimit,
    body: z.object({
      name:     z.string().min(2).max(100).trim(),
      phone:    MobileNumber(),
      password: NewPassword,
      code:     z.string().regex(/^\d{6}$/, "کد تأیید باید ۶ رقم باشد"),
    }),
  },
  async ({ req, body, tooMany }) => {
    // Before the code: spending a single-use code to say "taken" would waste it.
    if (await isPhoneRegistered(body.phone)) throw conflict("این شماره قبلاً ثبت شده است");

    const codeRl = await otpVerifyRateLimit(body.phone);
    if (!codeRl.allowed) return tooMany(codeRl);

    const customer = await registerCustomer(body);

    // Fire and forget; a no-op without an SMS line, and never fails the sign-up.
    void sendSms(customer.phone, "به رسامپ خوش آمدید. حساب کاربری شما با موفقیت ساخته شد.");

    const user = { id: customer.id, name: customer.name, phone: customer.phone };
    return startSession(NextResponse.json({ ok: true, user }), { kind: "customer", id: customer.id }, req);
  },
);
