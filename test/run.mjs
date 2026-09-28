// `npm test`: unit tests -> reset test DB -> seed -> build -> start the app on
// :3100 -> API tests -> importer tests -> tear down.
//
// A production build, never `next dev` (§22b): dev recompiles per request, and
// under it the 120-read test wedged the server past undici's 300 s timeout.

import { spawn, execSync } from "node:child_process";
import { openSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  // against this value (they open sessions in the store directly).
  ADMIN_PASSWORD_HASH: "test-admin-hash-not-verified-by-tests",
  ADMIN_NAME: "Test Admin",
  NESHAN_API_KEY: "test-key",
  NEXT_PUBLIC_NESHAN_KEY: "test-key",
  NEXT_TELEMETRY_DISABLED: "1",
  // Build into a separate directory so a test run never replaces the .next
  // that `npm run demo` is serving (read by next.config.ts).
  NEXT_DIST_DIR: ".next-test",
  // Its own upload folder, so test photos never land beside the demo's.
  UPLOAD_DIR: "storage/test-uploads",
  // No SMS and no on-screen echo: helpers.recoverOtpCode() finds the code.
  OTP_DEV_ECHO: "0",
  // Every test request names its own address in X-Forwarded-For, so buckets do
  // not collide across tests; that is the behind-a-proxy reading. The demo's
  // own .env says 0, where server.mjs's socket address is used instead.
  TRUSTED_PROXY_COUNT: "1",
};

function step(msg) {
  console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`);
}

/**
 * Refuse to start if something already listens on our port: the readiness
 * probe cannot tell our server from a leftover `next start`, and the suite
 * would run against its build and database.
 */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    const done = (answer) => { socket.destroy(); resolve(answer); };
    socket.setTimeout(500);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

if (await portInUse(PORT)) {
  console.error(
    `\n\u2717 port ${PORT} is already in use.\n` +
      "  Something else is listening there — most likely a leftover `next start`.\n" +
      "  The tests would silently run against it. Stop it and try again:\n" +
      `      lsof -nP -iTCP:${PORT} -sTCP:LISTEN\n`,
  );
  process.exit(1);
}

// The pure rules first: they need no build, take under a second, and a broken
// rule is better reported now than after a minute of building.
step("unit tests (lib/domain)");
execSync("npm run --silent test:unit", { stdio: "inherit" });

step("reset test database");
execSync("node test/reset-db.mjs", { stdio: "inherit", env });

step("seed fixtures");
execSync("node test/seed.mjs", { stdio: "inherit", env });

step("build the app (production mode)");
execSync("node scripts/clean-build-types.mjs", { stdio: "inherit" });
execSync("npx next build", { stdio: "inherit", env });

step(`start next on :${PORT}`);
/**
 * The server logs to a file, not a pipe: `execSync` below blocks the parent for
 * the whole run, so a pipe filled at 64 KB and the server blocked on its own
 * stdout.
 */
const SERVER_LOG = join(tmpdir(), `rasamap-server-${PORT}-${process.pid}.log`);
const serverOut = openSync(SERVER_LOG, "w");
// server.mjs, the server `npm run demo` runs — not `next start` — so the suite
// exercises exactly what is presented.
const server = spawn("node", ["server.mjs"], {
  env: { ...env, PORT: String(PORT), NODE_ENV: "production" },
  stdio: ["ignore", serverOut, serverOut],
});

/** The server's output so far, for a failure message. */
function serverOutput() {
  try {
    return readFileSync(SERVER_LOG, "utf8");
  } catch {
    return "(no server output captured)";
  }
}

async function waitForServer(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // An early exit usually means the port was taken.
    if (server.exitCode !== null) return false;
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
    console.error(
      `\nserver did not become ready on ${BASE}. If something else is already\n` +
        `listening on port ${PORT}, stop it and run again. Recent output:\n` +
        serverOutput().slice(-3000),
    );
    process.exit(1);
  }
  step("run tests");
  // Two files, two runs, in this order and never in parallel: the importer
  // tests write rows into the same database the API tests count.
  execSync("node --test --test-reporter=spec test/api.test.mjs", {
    stdio: "inherit",
    env: { ...env, TEST_BASE_URL: BASE },
  });
  execSync("node --test --test-reporter=spec test/sync.test.mjs", {
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
