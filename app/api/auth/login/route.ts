import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { SIGN_IN_DENIED, signIn, signInAttempt } from "@/lib/auth/sign-in";
import { GivenPassword } from "@/lib/domain/password";
import { latinDigits } from "@/lib/domain/digits";

// POST /api/auth/login — one form for customers (mobile) and staff (email); see lib/auth/sign-in.ts.

// Older field names are still accepted; the form sends `identifier`.
const LoginSchema = z
  .object({
    identifier: z.string().optional(),
    phone:      z.string().optional(),
    email:      z.string().optional(),
    password:   GivenPassword,
  })
  .transform(b => ({ identifier: latinDigits((b.identifier ?? b.phone ?? b.email ?? "").trim()), password: b.password }))
  .refine(b => b.identifier.length > 0 && b.identifier.length <= 160);

export const POST = defineRoute(
  {
    name: "auth/login",
    access: "public",
    rateLimit: { afterBody: (b, ip, req) => signInAttempt(b.identifier, ip, req) },
    body: LoginSchema,
    messages: { invalidBody: SIGN_IN_DENIED },
  },
  async ({ req, ip, userAgent, body }) => signIn(req, { ip, userAgent }, body.identifier, body.password),
);
