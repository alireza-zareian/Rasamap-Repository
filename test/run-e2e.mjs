// `npm run test:e2e`: reset the test DB -> seed -> build -> start the app on
// :3200 -> drive Chrome (test/browser.mjs) -> tear down. Same rules as
// test/run.mjs, with its own port, database and dist directory so the two
// suites can run at once.

import { spawn, execSync } from "node:child_process";
import { openSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.TEST_E2E_PORT || 3200);
const BASE = `http://localhost:${PORT}`;

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!existsSync(CHROME)) {
  console.error(
    `\n✗ No Chrome at ${CHROME}\n` +
      "  Install Google Chrome, or point CHROME_PATH at a Chromium build.\n" +
      "  (The API suite, npm test, needs no browser and is unaffected.)\n",
  );
  process.exit(1);
}

// Values set here win over .env* files — Next does not override real env vars.
const env = {
  ...process.env,
  DATABASE_URL: "file:./prisma/e2e.db",
  AUTH_SECRET: "rasamap_e2e_secret_key_0123456789_abcdef",
  ADMIN_EMAIL: "admin@test.local",
  ADMIN_PASSWORD_HASH: "test-admin-hash-not-verified-by-tests",
  ADMIN_NAME: "Test Admin",
  NEXT_TELEMETRY_DISABLED: "1",
  // Its own build directory, so a browser run never replaces the .next that
  // `npm run demo` is serving or the .next-test the API suite builds.
  NEXT_DIST_DIR: ".next-e2e",
  // Its own upload folder, so test photos never land beside the demo's.
  UPLOAD_DIR: "storage/e2e-uploads",
  TEST_BASE_URL: BASE,
  // Off, as in test/run.mjs: the sign-up flow is proven without the demo echo.
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

step("reset the browser-test database");
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

function stop() {
  if (!server.killed) server.kill("SIGTERM");
}
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });

// Wait for it to answer rather than guessing how long a cold start takes.
let up = false;
for (let i = 0; i < 120; i++) {
  // An early exit usually means the port was taken.
  if (server.exitCode !== null) break;
  try {
    const res = await fetch(`${BASE}/api/health`);
    if (res.ok) { up = true; break; }
  } catch { /* not listening yet */ }
  await sleep(500);
}
if (!up) {
  console.error(
    `\n✗ the server never became healthy on ${BASE}\n` +
      `  If something else is already listening on port ${PORT}, stop it and run again.\n` +
      serverOutput(),
  );
  stop();
  process.exit(1);
}

step("run the browser tests");
let failed = false;
try {
  // A test that hangs fails after two minutes instead of holding the run open.
  execSync("node --test --test-timeout=120000 test/e2e.test.mjs", { stdio: "inherit", env, timeout: 15 * 60_000 });
} catch {
  failed = true;
}

step("stop server");
stop();
process.exit(failed ? 1 : 0);
