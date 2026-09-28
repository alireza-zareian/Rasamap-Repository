// SMS through Kavenegar, dormant until KAVENEGAR_API_KEY is set (§16): until
// then every send returns `{ sent: false, reason: "sms_disabled" }` and nothing
// throws. A live line needs a paid top-up and a verified sender.
//
// Never log a full phone number or a code: a masked phone and the code length only.

import { logger } from "./logger";

const API_KEY      = process.env.KAVENEGAR_API_KEY?.trim() ?? "";
const SENDER       = process.env.KAVENEGAR_SENDER?.trim() ?? "";
const OTP_TEMPLATE = process.env.KAVENEGAR_OTP_TEMPLATE?.trim() ?? "";
const TIMEOUT_MS   = 8000;

/** Whether an API key is configured; OTP_DEV_ECHO may show the code only when it is not. */
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
 * Send a one-time code: through Kavenegar's verify-lookup template when
 * KAVENEGAR_OTP_TEMPLATE is set (no sender approval needed), else as plain SMS.
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
