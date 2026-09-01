// Next.js startup hook — runs once when the server process boots.
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

export async function register() {
  // Node runtime only — skip on the Edge runtime (proxy.ts), which has no
  // access to the full server env and does not need this check.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    validateEnv();
  }
}
