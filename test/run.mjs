// Orchestrator: unit tests -> reset test DB -> seed fixtures -> build -> start the app on an
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
  // against this value (they mint session JWTs directly).
  ADMIN_PASSWORD_HASH: "test-admin-hash-not-verified-by-tests",
  ADMIN_NAME: "Test Admin",
  NESHAN_API_KEY: "test-key",
  NEXT_PUBLIC_NESHAN_KEY: "test-key",
  NEXT_TELEMETRY_DISABLED: "1",
  // Build into a separate directory so a test run never replaces the .next
  // that `npm run demo` is serving (read by next.config.ts).
  NEXT_DIST_DIR: ".next-test",
  // SMS stays dormant here (no KAVENEGAR_API_KEY), and the on-screen code echo
  // the demo laptop turns on in .env is forced off, so the suite proves the
  // flows with only what a real client receives: helpers.recoverOtpCode()
  // reads the issued code from the store instead.
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

// The pure rules first: they need no build, take under a second, and a broken
// rule is better reported now than after a minute of building.
step("unit tests (lib/domain)");
execSync("npm run --silent test:unit", { stdio: "inherit" });

step("reset test database");
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

async function waitForServer(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // A server that has already exited will never become ready, and the usual
    // reason is that the port was taken. That case must be caught here, because
    // the readiness check below cannot tell our server from a stranger already
    // answering on the same port — it would pass, and the whole suite would run
    // against someone else's app and someone else's database. test/browser.mjs
    // guards Chrome's debugging port against exactly this; the app's port had
    // no such guard, and a stray `next start` on this port was enough to turn
    // the run into a wall of meaningless failures.
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
