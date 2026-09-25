// Orchestrator for the browser tests: reset the test DB -> seed -> build ->
// start the app on its own port -> drive a real Chrome against it -> tear down.
//
//   npm run test:e2e
//
// Same shape and the same rules as test/run.mjs, and for the same reasons:
// a PRODUCTION build (§22b — `next dev` recompiles per request and wedged the
// API suite once already), its own database file, its own port. It uses a
// different port and a different dist directory from `npm test`, so the two
// suites can run at the same time without fighting over either.
//
// The browser is the Chrome already installed on the machine, driven over the
// DevTools Protocol by test/browser.mjs — see the note at the top of that file
// for why this is not Playwright.

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
  TEST_BASE_URL: BASE,
  // Off, as in test/run.mjs: the sign-up flow is proven without the demo echo.
  OTP_DEV_ECHO: "0",
};

function step(msg) {
  console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`);
}

/**
 * Refuse to start if something is already listening on our port.
 *
 * This is checked before spawning, and deterministically, because the readiness
 * probe that follows cannot tell our server from a stranger: a leftover
 * `next start` on this port answers the probe, the suite runs against its build
 * and its database, and the failures that follow name code that is fine. It is
 * not hypothetical — it happened twice while this guard was being written, once
 * costing an afternoon to a "slow endpoint" that was really someone else's
 * server. Checking the spawned process for an early exit is not enough on its
 * own: the probe can succeed against the stranger before our own process has
 * finished failing to bind.
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
execSync("npx next build", { stdio: "inherit", env });

step(`start next on :${PORT}`);
/**
 * Where the server's own output goes.
 *
 * It used to be a pipe, with the parent accumulating every line into a string.
 * That only works while the parent's event loop is free to drain it — and it is
 * not: `execSync` below blocks the parent for the whole test run. Once the 64 KB
 * pipe buffer filled, the *server* blocked writing to its own stdout, stopped
 * answering, and a request eventually tripped the suite's 30 s timeout. It read
 * as a slow endpoint; it was the harness holding the server's mouth shut, and
 * it got worse the more the server logged, so it surfaced as a flaky tail
 * rather than as an obvious failure.
 *
 * A file has no backpressure, so the server never blocks on it, and the output
 * is still there to print when something goes wrong.
 */
const SERVER_LOG = join(tmpdir(), `rasamap-server-${PORT}-${process.pid}.log`);
const serverOut = openSync(SERVER_LOG, "w");
const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env,
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
  // A server that has already exited will never become ready, and the usual
  // reason is that the port was taken. That case must be caught here, because
  // the readiness check below cannot tell our server from a stranger already
  // answering on the same port — it would pass, and the whole suite would run
  // against someone else's app and someone else's database. test/browser.mjs
  // guards Chrome's debugging port against exactly this; the app's port had
  // no such guard, and a stray `next start` on this port was enough to turn
  // the run into a wall of meaningless failures.
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
  execSync("node --test test/e2e.test.mjs", { stdio: "inherit", env });
} catch {
  failed = true;
}

step("stop server");
stop();
process.exit(failed ? 1 : 0);
