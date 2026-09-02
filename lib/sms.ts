// ============================================================
// RASAMAP — SMS (Kavenegar), dormant by default
//
// The whole layer is a no-op until KAVENEGAR_API_KEY is set. Nothing here
// throws: register still works, the OTP endpoints still respond, and code that
// wants to send a message just gets `{ sent: false, reason: "sms_disabled" }`.
// Fill the env var in and it starts sending — no code change.
//
// Why it ships disabled: a Kavenegar line needs a paid minimum top-up and a
// verified sender, which is not worth doing for a capstone demo. The
// integration is complete and covered by tests so it can be switched on in
// minutes. See docs/engineering-decisions.md §10.
//
// Privacy: never log a full phone number or an OTP code — only a masked phone
// and the code length.
// ============================================================

import { logger } from "./logger";

const API_KEY      = process.env.KAVENEGAR_API_KEY?.trim() ?? "";
const SENDER       = process.env.KAVENEGAR_SENDER?.trim() ?? "";
const OTP_TEMPLATE = process.env.KAVENEGAR_OTP_TEMPLATE?.trim() ?? "";
const TIMEOUT_MS   = 8000;

/** True when a real API key is configured. Callers can branch on this to keep
 *  a dev/demo affordance (e.g. echoing the OTP into logs). */
export const smsEnabled = API_KEY.length > 0;

export interface SmsResult {
  sent: boolean;
  reason?: "sms_disabled" | "sms_error";
}

function maskPhone(phone: string): string {
  return phone.length >= 7 ? `${phone.slice(0, 4)}***${phone.slice(-2)}` : "***";
}

async function kavenegar(pathAndQuery: string, form: Record<string, string>): Promise<boolean> {
  const body = new URLSearchParams(form);
  const res = await fetch(`https://api.kavenegar.com/v1/${API_KEY}/${pathAndQuery}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    logger.warn("sms provider http error", { status: res.status });
    return false;
  }
  const json = (await res.json().catch(() => null)) as { return?: { status?: number } } | null;
  return json?.return?.status === 200;
}

/** Send a plain SMS. Returns without throwing on any failure. */
export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  if (!smsEnabled) {
    logger.info("sms skipped (disabled)", { phone: maskPhone(phone) });
    return { sent: false, reason: "sms_disabled" };
  }
  try {
    const ok = await kavenegar("sms/send.json", {
      receptor: phone,
      message,
      ...(SENDER ? { sender: SENDER } : {}),
    });
    logger.info("sms sent", { phone: maskPhone(phone), ok });
    return ok ? { sent: true } : { sent: false, reason: "sms_error" };
  } catch (err) {
    logger.warn("sms send failed", { phone: maskPhone(phone), error: err instanceof Error ? err.message : String(err) });
    return { sent: false, reason: "sms_error" };
  }
}

/**
 * Send a one-time code. If KAVENEGAR_OTP_TEMPLATE is set, Kavenegar's dedicated
 * verify-lookup line is used (higher deliverability, no sender approval needed
 * — the recommended path in Iran); otherwise it falls back to a plain SMS.
 */
export async function sendOtp(phone: string, code: string): Promise<SmsResult> {
  if (!smsEnabled) {
    logger.info("otp sms skipped (disabled)", { phone: maskPhone(phone), codeLen: code.length });
    return { sent: false, reason: "sms_disabled" };
  }
  try {
    if (OTP_TEMPLATE) {
      const ok = await kavenegar("verify/lookup.json", { receptor: phone, token: code, template: OTP_TEMPLATE });
      logger.info("otp sms sent (lookup)", { phone: maskPhone(phone), ok });
      return ok ? { sent: true } : { sent: false, reason: "sms_error" };
    }
    return await sendSms(phone, `کد تأیید رسامپ: ${code}`);
  } catch (err) {
    logger.warn("otp sms failed", { phone: maskPhone(phone), error: err instanceof Error ? err.message : String(err) });
    return { sent: false, reason: "sms_error" };
  }
}
