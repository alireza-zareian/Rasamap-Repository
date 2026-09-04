import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { createSession, buildSessionCookieHeader } from "@/lib/auth/session";
import { userLoginRateLimit, resetUserLoginAttempts } from "@/lib/auth/rate-limit";
import { TIMING_PAD_HASH, validateCredentials } from "@/lib/auth/users";
import { auditLog } from "@/lib/auth/audit";
import { withApiLog } from "@/lib/api-log";

/**
 * One sign-in form, two kinds of account.
 *
 * Customers register with a mobile number and the team with an email address,
 * so the credential's own shape says which table to look in — there is no
 * guessing, and no probing one store after the other. That is what makes a
 * single form safe here: an email can never match a `users` row and a phone can
 * never match an `admins` one, so nothing about the failure reveals which store
 * was consulted. Both answers are the same sentence, and both cost the same
 * bcrypt comparison.
 *
 * The alternative — leaving staff to a separate page — is what the site had,
 * and it meant an administrator browsing the public catalogue was a stranger to
 * it: unable to answer a review, with no way in but a URL they had to remember.
 */
const LoginSchema = z.object({
  identifier: z.string().trim().min(1).max(160),
  password:   z.string().min(1).max(128),
});

// Every refusal says exactly this, whichever store was consulted and whatever
// went wrong — a different wording for "no such account" would be an oracle.
const DENIED = "شماره/ایمیل یا رمز عبور اشتباه است";

const PHONE = /^09[0-9]{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function POSTHandler(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = userLoginRateLimit(ip);
  if (!rl.allowed) {
    // The shared helper adds Retry-After and says how many minutes to wait —
    // these lock for a quarter of an hour or more, so "try later" is not enough.
    return rateLimited(rl, { endpoint: "auth/login", ip });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 }); }

  // The body accepts the field under either name so an older client keeps
  // working; `identifier` is what the form sends now.
  const raw = body as Record<string, unknown> | null;
  const parsed = LoginSchema.safeParse({
    identifier: raw?.identifier ?? raw?.phone ?? raw?.email,
    password:   raw?.password,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: DENIED }, { status: 400 });
  }

  const { identifier, password } = parsed.data;

  if (EMAIL.test(identifier)) {
    const staff = await validateCredentials(identifier.toLowerCase(), password);
    if (!staff) {
      auditLog("login_failure", "warn", {
        ip,
        userAgent: req.headers.get("user-agent") ?? undefined,
        details: { email: identifier, via: "public form" },
      });
      return NextResponse.json({ error: DENIED }, { status: 401 });
    }

    const token = await createSession({
      userId: staff.id, email: staff.email, name: staff.name, role: staff.role,
    });
    resetUserLoginAttempts(ip);
    auditLog("login_success", "info", {
      userId: staff.id, userEmail: staff.email, ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
      details: { via: "public form" },
    });

    const res = NextResponse.json({
      ok: true, user: { id: staff.id, name: staff.name, role: staff.role, isStaff: true },
    });
    res.headers.set("Set-Cookie", buildSessionCookieHeader(token, req));
    return res;
  }

  if (!PHONE.test(identifier)) {
    return NextResponse.json({ error: DENIED }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { phone: identifier } });

  // Timing-safe: always run a real bcrypt comparison, even when the phone is
  // not registered, so response time can't be used to enumerate accounts.
  const hashToCheck = user?.passwordHash ?? TIMING_PAD_HASH;
  const match = await bcrypt.compare(password, hashToCheck);

  if (!user || !match) {
    return NextResponse.json({ error: DENIED }, { status: 401 });
  }

  const token = await createSession({ userId: user.id.toString(), email: user.phone, name: user.name, role: "user" });
  resetUserLoginAttempts(ip);

  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, phone: user.phone, isStaff: false } });
  res.headers.set("Set-Cookie", buildSessionCookieHeader(token, req));
  return res;
}

export const POST = withApiLog("auth/login", POSTHandler);
