import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { otpSendRateLimit, otpSendIpRateLimit } from "@/lib/rate-limit";
import { issueOtp } from "@/lib/db/otp-codes";
import { isPhoneRegistered } from "@/lib/db/customers";
import { sendOtp, smsEnabled } from "@/lib/sms";
import { auditLog } from "@/lib/audit";
import { isLocalNetworkRequest, isLoopbackAddress } from "@/lib/auth/client-ip";
import { MobileNumber } from "@/lib/domain/phone";

// Show the code on screen when there is no SMS line — the demo laptop. Keyed
// on that fact, not on NODE_ENV (the demo runs production). It needs the flag,
// turns off once KAVENEGAR_API_KEY is set, answers only local-network visits,
// and lib/env.ts warns at boot while it is on.
const DEV_ECHO = process.env.OTP_DEV_ECHO === "1" && !smsEnabled;

// POST /api/auth/otp/send — start a phone-verified flow: reset or sign-up (public)
export const POST = defineRoute(
  {
    name: "auth/otp/send",
    access: "public",
    rateLimit: otpSendIpRateLimit,
    body: z.object({
      phone:   MobileNumber(),
      purpose: z.enum(["password_reset", "register"]),
    }),
  },
  async ({ req, ip, body, tooMany }) => {
    const { phone, purpose } = body;

    // Keyed on the number being texted: this is what bounds the SMS bill.
    const phoneRl = await otpSendRateLimit(phone);
    if (!phoneRl.allowed) return tooMany(phoneRl);

    const registered = await isPhoneRegistered(phone);

    // A reset answers the same whether or not the number is registered, so it
    // reveals nothing. Sign-up says so plainly: creating the account would
    // refuse a duplicate anyway, and silence would leave a mistyped number
    // waiting for a code. The per-phone limit above bounds probing.
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
      // A sign-up code shows anywhere on the LAN (a reviewer's phone can sign
      // up); a reset code only on the laptop itself, or anyone in the room
      // could reset the demo account.
      const echoHere = purpose === "register" ? isLocalNetworkRequest(req, ip) : isLoopbackAddress(ip);
      if (DEV_ECHO && echoHere) devCode = code;
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
