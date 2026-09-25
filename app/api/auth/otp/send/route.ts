import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { otpSendRateLimit, otpSendIpRateLimit } from "@/lib/rate-limit";
import { issueOtp } from "@/lib/db/otp-codes";
import { isPhoneRegistered } from "@/lib/db/customers";
import { sendOtp, smsEnabled } from "@/lib/sms";
import { auditLog } from "@/lib/audit";

// Echo the code back on screen, for a machine with no SMS line — the demo
// laptop. It used to be refused whenever NODE_ENV was "production", which
// `next start` always sets, so on `npm run demo` sign-up and password reset
// could not be completed at all: the code reached no phone and no screen.
//
// It is keyed on the fact that matters instead: there is no SMS line to send
// through. It needs the explicit flag too, and it switches itself off the
// moment KAVENEGAR_API_KEY is set. Left on in a real deployment without SMS,
// anyone could reset any customer's password, which is why lib/env.ts warns
// loudly at boot whenever it is armed.
const DEV_ECHO = process.env.OTP_DEV_ECHO === "1" && !smsEnabled;

// POST /api/auth/otp/send — start a phone-verified flow: reset or sign-up (public)
export const POST = defineRoute(
  {
    name: "auth/otp/send",
    access: "public",
    rateLimit: otpSendIpRateLimit,
    body: z.object({
      phone:   z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست"),
      purpose: z.enum(["password_reset", "register"]),
    }),
  },
  async ({ ip, body, tooMany }) => {
    const { phone, purpose } = body;

    // Keyed on the number being texted: this is what bounds the SMS bill.
    const phoneRl = await otpSendRateLimit(phone);
    if (!phoneRl.allowed) return tooMany(phoneRl);

    const registered = await isPhoneRegistered(phone);

    // A number already registered is the answer to sign-up and the requirement
    // for a reset, so the two purposes read the same fact in opposite
    // directions.
    //
    // Only one of them can stay silent about what it found. A reset says
    // nothing: it issues a code when the account exists and returns the
    // identical body when it does not, so the endpoint cannot be used to test
    // whether a number is registered. Sign-up answers plainly, because it has
    // nothing left to hide — an account cannot be opened twice on one number,
    // so the step that creates it must refuse a duplicate anyway, and staying
    // quiet here would only leave a visitor who mistyped one digit waiting for
    // a code that was never going to arrive. What bounds the abuse is the
    // per-phone ceiling above, not silence this side of it.
    if (purpose === "register" && registered) {
      return NextResponse.json(
        { error: "این شماره قبلاً ثبت شده است. وارد شوید یا رمز عبور را بازیابی کنید." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    let devCode: string | undefined;
    if (purpose === "register" || registered) {
      const code = await issueOtp(phone, purpose);
      const r = await sendOtp(phone, code);
      auditLog("otp_sent", "info", { ip, details: { purpose, delivered: r.sent, smsEnabled } });
      if (DEV_ECHO) devCode = code;
    }

    const message = purpose === "register"
      ? "کد تأیید به این شماره ارسال شد."
      : "اگر این شماره ثبت شده باشد، کد تأیید ارسال شد.";

    return NextResponse.json(
      { ok: true, message, ...(devCode ? { devCode } : {}) },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);
