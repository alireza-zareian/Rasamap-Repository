// Orchestrator: reset test DB -> seed fixtures -> build -> start the app on an
// isolated port with test env -> run the API tests against it -> tear down.
//
//   npm test
//
// The server runs a *production* build (`next build` + `next start`), not
// `next dev`, for the reason in docs/engineering-decisions.md §22: dev mode
// recompiles a route on every request and costs ~97x the CPU. Under `next dev`
// the 120-read loop in "reading is not rate limited the way writing is" pushed
// a single request past undici's 300 s header timeout, which wedged the server
// and cascaded into ~20 spurious failures at the tail of the suite. Building
// once up front costs about a minute and makes the run both fast and honest —
// the tests then exercise the same output that ships.

import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.TEST_PORT || 3100);
const BASE = `http://localhost:${PORT}`;

// Test env. Values set here win over .env* files (Next does not override real env vars).
const env = {
  ...process.env,
  DATABASE_URL: "file:./prisma/test.db",
  AUTH_SECRET: "rasamap_test_secret_key_0123456789_abcdef",
  ADMIN_EMAIL: "admin@test.local",
  // No "$" here on purpose: passed through spawn env it would be run through
  // @next/env's variable expansion and mangled. The tests never bcrypt-verify
  // against this value (they mint session JWTs directly).
  ADMIN_PASSWORD_HASH: "test-admin-hash-not-verified-by-tests",
  ADMIN_NAME: "Test Admin",
  NESHAN_API_KEY: "test-key",
  NEXT_PUBLIC_NESHAN_KEY: "test-key",
  NEXT_TELEMETRY_DISABLED: "1",
  // Build into a separate directory so a test run never replaces the .next
  // that `npm run demo` is serving (read by next.config.ts).
  NEXT_DIST_DIR: ".next-test",
  // SMS stays dormant here (no KAVENEGAR_API_KEY). The reset test does not
  // need OTP_DEV_ECHO: that echo is gated on NODE_ENV and so cannot arm
  // against this production build, and helpers.recoverOtpCode() reads the
  // issued code from the store instead.
};

function step(msg) {
  console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`);
}

step("reset test database");
execSync("node test/reset-db.mjs", { stdio: "inherit", env });

step("seed fixtures");
execSync("node test/seed.mjs", { stdio: "inherit", env });

step("build the app (production mode)");
execSync("npx next build", { stdio: "inherit", env });

step(`start next on :${PORT}`);
const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitForServer(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/billboards?limit=1`, {
        headers: { "user-agent": "Mozilla/5.0 (rasamap-test-suite)" },
      });
      if (r.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  return false;
}

let code = 1;
try {
  if (!(await waitForServer())) {
    console.error("\nserver did not become ready. Recent output:\n" + serverLog.slice(-3000));
    process.exit(1);
  }
  step("run tests");
  execSync("node --test --test-reporter=spec test/api.test.mjs", {
    stdio: "inherit",
    env: { ...env, TEST_BASE_URL: BASE },
  });
  code = 0;
} catch (e) {
  code = typeof e.status === "number" ? e.status : 1;
} finally {
  step("stop server");
  server.kill("SIGTERM");
  await sleep(500);
  server.kill("SIGKILL");
}

process.exit(code);
