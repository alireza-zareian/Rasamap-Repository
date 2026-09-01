import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateCredentials } from "@/lib/auth/users";
import { createSession, buildSessionCookieHeader } from "@/lib/auth/session";
import { loginRateLimit, resetLoginAttempts } from "@/lib/auth/rate-limit";
import { auditLog } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/auth/client-ip";
import { withApiLog } from "@/lib/api-log";

const LoginSchema = z.object({
  email:    z.string().email().max(254).toLowerCase().trim(),
  password: z.string().min(8).max(128),
});

async function POSTHandler(req: NextRequest) {
  const ip = getClientIp(req);

  // ── Rate limiting ──
  const rl = loginRateLimit(ip);
  if (!rl.allowed) {
    const retryAfter = rl.lockedUntil
      ? Math.ceil((rl.lockedUntil - Date.now()) / 1000)
      : 900;
    auditLog("rate_limit_hit", "warn", {
      ip,
      details: { endpoint: "login", retryAfter },
    });
    return NextResponse.json(
      { error: "تعداد تلاش‌های ورود بیش از حد مجاز است. لطفاً بعداً دوباره امتحان کنید." },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": "5",
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  // ── Parse & validate body ──
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

  // ── Validate credentials (bcrypt) ──
  const user = await validateCredentials(email, password);

  if (!user) {
    auditLog("login_failure", "warn", {
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
      details: { email },
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

  resetLoginAttempts(ip);

  auditLog("login_success", "info", {
    userId:    user.id,
    userEmail: user.email,
    ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
  res.headers.set("Set-Cookie", buildSessionCookieHeader(token));
  return res;
}

export const POST = withApiLog("admin/auth/login", POSTHandler);
