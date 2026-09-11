import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateCredentials } from "@/lib/auth/users";
import { createSession, buildSessionCookieHeader } from "@/lib/auth/session";
import { adminLoginAttempt, resetAccountAttempts } from "@/lib/auth/rate-limit";
import { auditLog } from "@/lib/auth/audit";
import { getClientIp, isClientIpTrusted } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { withApiLog } from "@/lib/api-log";

const LoginSchema = z.object({
  email:    z.string().email().max(254).toLowerCase().trim(),
  password: z.string().min(8).max(128),
});

async function POSTHandler(req: NextRequest) {
  const ip = getClientIp(req);

  // The body is read before the limit is checked, which reverses the usual
  // order for a reason: the tight half of the limit is keyed on the account
  // being attacked, and the account is in the body. The schema below caps the
  // payload at a few hundred bytes, so nothing expensive happens first.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ایمیل یا رمز عبور نادرست است" },   // generic — don't leak which field
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;

  // ── Rate limiting: this account, then this address ──
  const attempt = adminLoginAttempt(email, ip);
  if (!attempt.result.allowed) {
    return rateLimited(attempt.result, {
      endpoint: "admin/auth/login",
      ip,
      limitedBy: attempt.limitedBy,
    });
  }

  // ── Validate credentials (bcrypt) ──
  const user = await validateCredentials(email, password);

  if (!user) {
    auditLog("login_failure", "warn", {
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
      // Without a proxy chain to vouch for it, `ip` is a value this caller
      // supplied about itself. Recording that distinction keeps the row honest
      // about what it witnessed — see isClientIpTrusted.
      details: { email, ipTrusted: isClientIpTrusted(req) },
    });
    // Same response for bad email OR bad password (no enumeration)
    return NextResponse.json(
      { error: "ایمیل یا رمز عبور اشتباه است" },
      { status: 401 }
    );
  }

  // ── Create JWT session ──
  const token = await createSession({
    userId: user.id,
    email:  user.email,
    name:   user.name,
    role:   user.role,
  });

  resetAccountAttempts("login", email);

  auditLog("login_success", "info", {
    userId:    user.id,
    userEmail: user.email,
    ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
  res.headers.set("Set-Cookie", buildSessionCookieHeader(token, req));
  return res;
}

export const POST = withApiLog("admin/auth/login", POSTHandler);
