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
};

function step(msg) {
  console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`);
}

step("reset the browser-test database");
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
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });

function stop() {
  if (!server.killed) server.kill("SIGTERM");
}
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });

// Wait for it to answer rather than guessing how long a cold start takes.
let up = false;
for (let i = 0; i < 120; i++) {
  try {
    const res = await fetch(`${BASE}/api/health`);
    if (res.ok) { up = true; break; }
  } catch { /* not listening yet */ }
  await sleep(500);
}
if (!up) {
  console.error(`\n✗ the server never became healthy on ${BASE}\n${serverLog}`);
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
