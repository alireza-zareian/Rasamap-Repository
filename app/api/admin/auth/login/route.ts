import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { SIGN_IN_DENIED, signIn, signInAttempt } from "@/lib/auth/sign-in";

// POST /api/admin/auth/login — the staff-only sign-in form. Same budget and
// same refusal as the public form; it only refuses a phone number.
export const POST = defineRoute(
  {
    name: "admin/auth/login",
    access: "public",
    rateLimit: { afterBody: (b, ip, req) => signInAttempt(b.email, ip, req) },
    body: z.object({
      email:    z.string().email().max(254).toLowerCase().trim(),
      password: z.string().min(1).max(128),
    }),
    messages: { invalidBody: SIGN_IN_DENIED },
  },
  async ({ req, ip, userAgent, body }) => signIn(req, { ip, userAgent }, body.email, body.password, { staffOnly: true }),
);
