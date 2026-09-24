import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { isClientIpTrusted } from "@/lib/auth/client-ip";
import { startSession } from "@/lib/auth/actor";
import { userLoginAttempt, resetAccountAttempts } from "@/lib/rate-limit";
import { verifyStaffCredentials } from "@/lib/db/staff";
import { verifyCustomerCredentials } from "@/lib/db/customers";
import { auditLog } from "@/lib/audit";

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

// Every refusal says exactly this, whichever store was consulted and whatever
// went wrong — a different wording for "no such account" would be an oracle.
const DENIED = "شماره/ایمیل یا رمز عبور اشتباه است";

const PHONE = /^09[0-9]{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The identifier is accepted under its older names too, so a client from
// before the shared form keeps working; `identifier` is what the form sends now.
const LoginSchema = z
  .object({
    identifier: z.string().optional(),
    phone:      z.string().optional(),
    email:      z.string().optional(),
    password:   z.string().min(1).max(128),
  })
  .transform(b => ({ identifier: (b.identifier ?? b.phone ?? b.email ?? "").trim(), password: b.password }))
  .refine(b => b.identifier.length > 0 && b.identifier.length <= 160);

export const POST = defineRoute(
  {
    name: "auth/login",
    access: "public",
    // One budget per identifier, whichever store it belongs to: a staff email
    // and a customer phone never collide, so a caller cannot double their tries
    // by alternating between the two shapes.
    rateLimit: { afterBody: (b, ip) => userLoginAttempt(b.identifier, ip) },
    body: LoginSchema,
    messages: { invalidBody: DENIED },
  },
  async ({ req, ip, userAgent, body }) => {
    const { identifier, password } = body;

    if (EMAIL.test(identifier)) {
      const staff = await verifyStaffCredentials(identifier.toLowerCase(), password);
      if (!staff) {
        auditLog("login_failure", "warn", {
          ip,
          userAgent: userAgent ?? undefined,
          details: { email: identifier, via: "public form", ipTrusted: isClientIpTrusted(req) },
        });
        return NextResponse.json({ error: DENIED }, { status: 401 });
      }

      await resetAccountAttempts("user_login", identifier);
      auditLog("login_success", "info", {
        userId: `staff:${staff.id}`, userEmail: staff.email, ip,
        userAgent: userAgent ?? undefined,
        details: { via: "public form" },
      });
      const res = NextResponse.json({
        ok: true, user: { id: String(staff.id), name: staff.name, role: staff.role, isStaff: true },
      });
      return startSession(res, { kind: "staff", ...staff }, req);
    }

    if (!PHONE.test(identifier)) return NextResponse.json({ error: DENIED }, { status: 400 });

    const customer = await verifyCustomerCredentials(identifier, password);
    if (!customer) return NextResponse.json({ error: DENIED }, { status: 401 });

    await resetAccountAttempts("user_login", identifier);
    const res = NextResponse.json({ ok: true, user: { ...customer, isStaff: false } });
    return startSession(res, { kind: "customer", ...customer }, req);
  },
);
