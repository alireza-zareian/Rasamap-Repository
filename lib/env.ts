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
  // Map / geocoding — only the scraper and the client map need these; the core
  // app runs without them (the map layer degrades, nothing else).
  NESHAN_API_KEY: z.string().optional(),
  NEXT_PUBLIC_NESHAN_KEY: z.string().optional(),
  // Logging (see lib/logger.ts)
  LOG_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  // Reverse proxies in front of the app (see lib/auth/client-ip.ts)
  TRUSTED_PROXY_COUNT: z.string().regex(/^\d+$/, "must be a non-negative integer").optional(),
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

  if (!process.env.NEXT_PUBLIC_NESHAN_KEY) {
    // Not fatal — surfaced once so it isn't a silent "why is the map blank".
    console.warn("[env] NEXT_PUBLIC_NESHAN_KEY is not set — the map layer will be disabled.");
  }

  done = true;
}
