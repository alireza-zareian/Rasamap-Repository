import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { SIGN_IN_DENIED, signIn, signInAttempt } from "@/lib/auth/sign-in";
import { GivenPassword } from "@/lib/domain/password";
import { latinDigits } from "@/lib/domain/digits";

// POST /api/auth/login — one form for customers (mobile) and staff (email); see lib/auth/sign-in.ts.

const LoginSchema = z.object({
  identifier: z.string().transform(s => latinDigits(s.trim())).pipe(z.string().min(1).max(160)),
  password:   GivenPassword,
});

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
