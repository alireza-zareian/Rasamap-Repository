// Startup environment validation — fail closed.
//
// Called once from instrumentation.ts when the server boots. If a required
// variable is missing or malformed the process throws immediately with a list
// of what to fix, rather than failing later with an obscure runtime error
// (or, worse, running with an insecure default).

import { z } from "zod";

const required = z.object({
  DATABASE_URL: z.string().min(1, "required (e.g. file:./dev.db)"),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  ADMIN_EMAIL: z.string().email("must be a valid email address"),
  ADMIN_PASSWORD_HASH: z.string().min(1, "required (bcrypt hash)"),
  ADMIN_NAME: z.string().min(1, "required"),
});

const optional = z.object({
  // Geocoding, for the offline coordinate backfill only
  // (prisma/backfill-coordinates.ts). The running app never reads it: there is
  // no client-side map any more, so NEXT_PUBLIC_NESHAN_KEY is gone with it.
  NESHAN_API_KEY: z.string().optional(),
  // Logging (see lib/logger.ts)
  LOG_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  // The interface server.mjs listens on; unset means every interface (the demo).
  BIND_ADDRESS: z.string().optional(),
  // Reverse proxies in front of the app (see lib/auth/client-ip.ts)
  TRUSTED_PROXY_COUNT: z.string().regex(/^\d+$/, "must be a non-negative integer").optional(),
  // SMS (lib/sms.ts) — the whole layer is a no-op until KAVENEGAR_API_KEY is set.
  KAVENEGAR_API_KEY: z.string().optional(),
  KAVENEGAR_SENDER: z.string().optional(),
  KAVENEGAR_OTP_TEMPLATE: z.string().optional(),
  // Shows the OTP code on screen while no SMS line is configured — the demo
  // laptop (app/api/auth/otp/send/route.ts). Warned about below when armed.
  OTP_DEV_ECHO: z.enum(["0", "1"]).optional(),
  // Absolute site URL for sitemap/OG/canonical links (lib/site-url.ts);
  // defaults to https://rasamap.ir.
  NEXT_PUBLIC_BASE_URL: z.string().url("must be a valid URL").optional(),
  // Shared cache (cache-handler.js, next.config.ts) — dormant until set.
  REDIS_URL: z.string().url("must be a valid redis:// URL").optional(),
  REDIS_PREFIX: z.string().optional(),
});

let done = false;

export function validateEnv(): void {
  if (done) return;

  const result = required.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(
      "Environment validation failed:\n" +
        lines.join("\n") +
        "\n\nSet these in .env.local (see .env.example), then restart.",
    );
  }

  const opt = optional.safeParse(process.env);
  if (!opt.success) {
    const lines = opt.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error("Invalid optional environment variable:\n" + lines.join("\n"));
  }

  if (process.env.OTP_DEV_ECHO === "1" && !process.env.KAVENEGAR_API_KEY?.trim()) {
    // console, not the logger: this must show in the terminal whatever LOG_LEVEL says.
    console.warn(
      "\n  ⚠ OTP_DEV_ECHO=1 with no SMS line: sign-up and reset codes are shown on screen.\n" +
      "    Fine for the demo laptop. On a public server anyone could reset any customer's password.\n",
    );
  }

  done = true;
}
