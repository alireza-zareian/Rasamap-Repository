import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { isClientIpTrusted } from "./client-ip";
import { endSession, getActor, startSession } from "./actor";
import { knownDevice, rememberDevice } from "./device";
import { adminLoginAttempt, resetAccountAttempts, userLoginAttempt, type CredentialAttempt } from "@/lib/rate-limit";
import { verifyStaffCredentials } from "@/lib/db/staff";
import { verifyCustomerCredentials } from "@/lib/db/customers";
import { recordAudit } from "@/lib/audit";

/**
 * Signing in, for both kinds of account.
 *
 * Customers sign in with a mobile number and the team with an email address,
 * so the identifier's own shape says which table to look in — no guessing, and
 * no probing one store after the other. An email can never match a `users` row
 * and a phone can never match an `admins` one, so nothing about a refusal
 * reveals which store was consulted: every refusal is the same sentence, and
 * every one costs the same bcrypt comparison.
 *
 * Every attempt, successful or not, is written to the durable audit table. They
 * used to go only to an in-memory buffer, which a restart emptied — so the one
 * record of who signed in to the panel did not survive the process. A flood
 * cannot turn into a flood of rows: once an account or an address is out of
 * attempts, the request is refused before it reaches here.
 */

export const SIGN_IN_DENIED = "شماره/ایمیل یا رمز عبور اشتباه است";

const PHONE = /^09[0-9]{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(identifier: string): boolean {
  return EMAIL.test(identifier);
}

/**
 * The rate limit for one attempt: the account's budget (or this browser's own,
 * if it has signed in to the account before — see lib/auth/device.ts), then the
 * address's. A staff email is charged to one budget whichever form it comes
 * through.
 */
export async function signInAttempt(identifier: string, ip: string, req: NextRequest): Promise<CredentialAttempt> {
  const device = await knownDevice(req, identifier);
  return isEmail(identifier)
    ? adminLoginAttempt(identifier, ip, device)
    : userLoginAttempt(identifier, ip, device);
}

/** A number in the log without the whole number: "0912***4567". */
function maskPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 4)}***${phone.slice(7)}` : "invalid";
}

/**
 * Check the credentials and, when they hold, answer with a new session.
 * `staffOnly` refuses a phone number outright, for the staff form.
 */
export async function signIn(
  req: NextRequest,
  ctx: { ip: string; userAgent: string | null },
  identifier: string,
  password: string,
  { staffOnly = false }: { staffOnly?: boolean } = {},
): Promise<NextResponse> {
  const who = { ip: ctx.ip, userAgent: ctx.userAgent };
  const ipTrusted = isClientIpTrusted(req);

  if (isEmail(identifier)) {
    const email = identifier.toLowerCase();
    const staff = await verifyStaffCredentials(email, password);
    if (!staff) {
      await recordAudit("login_failure", { ...who, severity: "warn", details: { email, ipTrusted } });
      return NextResponse.json({ error: SIGN_IN_DENIED }, { status: 401 });
    }
    await resetAccountAttempts("login", email, await knownDevice(req, email));
    await recordAudit("login_success", { ...who, actor: { kind: "staff", id: staff.id, email: staff.email } });

    const res = NextResponse.json({
      ok: true, user: { id: String(staff.id), name: staff.name, role: staff.role, isStaff: true },
    });
    await rememberDevice(res, req, email);
    return startSession(res, { kind: "staff", id: staff.id }, req);
  }

  if (staffOnly || !PHONE.test(identifier)) {
    return NextResponse.json({ error: SIGN_IN_DENIED }, { status: staffOnly ? 401 : 400 });
  }

  const customer = await verifyCustomerCredentials(identifier, password);
  if (!customer) {
    await recordAudit("login_failure", { ...who, severity: "warn", details: { phone: maskPhone(identifier), ipTrusted } });
    return NextResponse.json({ error: SIGN_IN_DENIED }, { status: 401 });
  }
  await resetAccountAttempts("user_login", identifier, await knownDevice(req, identifier));
  await recordAudit("login_success", { ...who, actor: { kind: "customer", id: customer.id } });

  const res = NextResponse.json({
    ok: true, user: { id: customer.id, name: customer.name, phone: customer.phone, isStaff: false },
  });
  await rememberDevice(res, req, identifier);
  return startSession(res, { kind: "customer", id: customer.id }, req);
}

/**
 * Sign this browser out, customer or staff, and say so in the log. The actor is
 * read before the row goes, so the log can name who left; other browsers of the
 * same account stay signed in.
 */
export async function signOut(req: NextRequest, ctx: { ip: string; userAgent: string | null }): Promise<NextResponse> {
  const actor = await getActor();
  const res = await endSession(NextResponse.json({ ok: true }), req);
  if (actor) await recordAudit("logout", { actor, ip: ctx.ip, userAgent: ctx.userAgent });
  return res;
}
