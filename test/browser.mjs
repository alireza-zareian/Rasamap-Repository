// A very small browser driver, over the Chrome DevTools Protocol.
//
// ── Why not Playwright ──────────────────────────────────────────────────────
// Because it could not be installed. `npm i -D @playwright/test` fails against
// the registry from here, and even when it does not, `playwright install`
// pulls a ~150 MB browser build from a CDN that is no more reachable. A test
// suite that only runs on a machine with an unfiltered connection is not a
// test suite this project can rely on.
//
// Chrome is already on this machine, and `docs/thesis/build.py` already drives
// the same binary headless to print the thesis. Node 26 has a global
// WebSocket. So the whole driver is this file and no dependency at all.
//
// It is deliberately small: navigate, wait, click, type, read, screenshot.
// Anything more elaborate belongs in a test, not here.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** How long any single wait may take before the test is called failed. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * The tests browse as an ordinary visitor, because that is who they are
 * standing in for.
 *
 * Headless Chrome announces itself as "HeadlessChrome/…", which proxy.ts
 * blocks by design — `headlesschrome` is in its BLOCK_UA list along with
 * selenium, puppeteer and playwright. Left alone, every page test here got the
 * 403 the anti-scraping layer exists to give, and the suite would have been
 * measuring the bot filter instead of the product. (It works, is the other
 * reading of that result. §20.)
 */
/**
 * A distinct client address per browser, the way test/helpers.mjs gives one to
 * every API request.
 *
 * Without it every test in the file arrives from 127.0.0.1, and the sign-in
 * tests spend one account's brute-force budget between them: the deliberate
 * wrong-password test trips the lockout, and the two later tests that need a
 * real sign-in then wait out a timeout instead of signing in. The failure looks
 * like a broken page and is actually the protection in §8 working exactly as
 * designed — which is worth knowing, and worth not re-discovering every time.
 */
let ipCounter = 0;
function uniqueIp() {
  ipCounter += 1;
  const n = ipCounter;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

/** Where goto() marks the document it is leaving. */
const NAV_STAMP = "__rasamapNav";

const VISITOR_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export class Browser {
  #proc;
  #ws;
  #profileDir;
  #nextId = 1;
  #pending = new Map();

  /**
   * @param {object} opts
   * @param {number} [opts.width]  viewport width — 1280 desktop, 390 phone
   * @param {number} [opts.height]
   */
  static async launch({ width = 1280, height = 900 } = {}) {
    const b = new Browser();
    b.#profileDir = mkdtempSync(join(tmpdir(), "rasamap-cdp-"));

    b.#proc = spawn(
      CHROME,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-first-run",
        "--disable-extensions",
        // Each run gets its own profile, so cookies and storage never leak
        // between tests — the browser equivalent of test/reset-db.mjs.
        `--user-data-dir=${b.#profileDir}`,
        // 0 = let the kernel pick a free port, and Chrome writes the one it got
        // to DevToolsActivePort in the profile directory. A random port picked
        // here instead could collide with the Chrome a previous test had not
        // finished shutting down — and because the collision is answered by
        // *that* browser, the new test would silently drive the old test's page.
        // That was the last source of flakiness in this suite: a different
        // assertion failed on each run because each test was reading whatever
        // page the previous one had left open.
        "--remote-debugging-port=0",
        `--window-size=${width},${height}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    // Chrome writes DevToolsActivePort once it has bound; poll for it rather
    // than guessing how long that takes on a loaded machine.
    const portFile = join(b.#profileDir, "DevToolsActivePort");
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        const pages = (await res.json()).filter((t) => t.type === "page");
        if (pages.length) { target = pages[0]; break; }
      } catch { /* not up yet */ }
      await sleep(100);
    }
    if (!target) throw new Error("Chrome did not expose a debugging target");

    b.#ws = new WebSocket(target.webSocketDebuggerUrl);
    b.#ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      const waiter = b.#pending.get(msg.id);
      if (!waiter) return;
      b.#pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(msg.error.message));
      else waiter.resolve(msg.result);
    });
    await new Promise((resolve, reject) => {
      b.#ws.addEventListener("open", resolve, { once: true });
      b.#ws.addEventListener("error", () => reject(new Error("CDP socket failed")), { once: true });
    });

    await b.send("Page.enable");
    await b.send("Runtime.enable");
    await b.send("Network.setUserAgentOverride", { userAgent: VISITOR_UA });
    await b.send("Network.enable");
    await b.send("Network.setExtraHTTPHeaders", { headers: { "x-forwarded-for": uniqueIp() } });
    // The window-size flag sets the OS window; the *layout* viewport is what
    // media queries read, and it has to be set explicitly in headless.
    await b.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width < 700,
    });
    return b;
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.#pending.delete(id)) reject(new Error(`${method} timed out`));
      }, DEFAULT_TIMEOUT_MS);
    });
  }

  /** Run an expression in the page and return its value. */
  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", {
      expression: `(() => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    return result.value;
  }

  /**
   * Arrive from a different address from here on.
   *
   * Needed wherever one test makes more than one *failed* sign-in: the
   * brute-force protection counts those per account and per IP (§8), so a
   * second deliberate failure from the same address is answered with the
   * rate-limit message rather than the rejection message the test is reading
   * for. That is the protection working; the test simply is not the place to
   * exercise it, and the API suite already does.
   */
  async setClientIp(ip = uniqueIp()) {
    await this.send("Network.setExtraHTTPHeaders", { headers: { "x-forwarded-for": ip } });
  }

  async goto(url) {
    // Stamp the document being left behind. A fresh document has no stamp, so
    // "the stamp is not mine" is exactly "this is a new document".
    const stamp = `nav-${Date.now()}-${Math.random()}`;
    await this.evaluate(`window.${NAV_STAMP} = ${JSON.stringify(stamp)}; return true;`).catch(() => {});
    await this.send("Page.navigate", { url });
    // Page.navigate resolves when the request has been *sent*. Waiting only for
    // readyState === "complete" is not enough, because the document that is
    // complete at that instant is still the previous one — so a second goto()
    // could find the old page's elements, count them, and read its text. That
    // showed up as "the result count is missing from the page" on a page that
    // demonstrably had it, about one run in three.
    //
    // So the wait is for a *different document* to be complete, not for a
    // particular address: stamp the current window, and wait until the stamp is
    // gone. Matching the requested URL instead would be wrong wherever the app
    // legitimately redirects — asking for /admin as a visitor lands on
    // /admin/login, which is the behaviour one of these tests is checking.
    await this.waitFor(
      `document.readyState === "complete" && window.${NAV_STAMP} !== ${JSON.stringify(stamp)}`,
      { label: `navigation to ${url}` },
    );
  }

  /** Poll a JS condition until it is true. The condition is a JS expression. */
  async waitFor(condition, { timeout = DEFAULT_TIMEOUT_MS, label } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await this.evaluate(`return Boolean(${condition})`)) return;
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${label ?? condition}`);
  }

  /** Wait for a CSS selector to exist, then return how many matched. */
  async waitForSelector(selector, opts) {
    await this.waitFor(`document.querySelector(${JSON.stringify(selector)})`, {
      ...opts,
      label: `selector ${selector}`,
    });
    return this.count(selector);
  }

  count(selector) {
    return this.evaluate(`return document.querySelectorAll(${JSON.stringify(selector)}).length`);
  }

  /**
   * Wait for a phrase to be on the page, then return the whole page text.
   *
   * Reading text() straight after waitForSelector() is a race, and a narrow one
   * — which is the worst kind. Next streams the route's loading.tsx fallback,
   * then swaps the real content in; for a few frames the new content is in the
   * DOM *and* the fallback has not been removed yet. A selector wait is
   * satisfied by the first, and the page text still says "در حال بارگذاری".
   * One assertion in three runs failed on that.
   *
   * So: wait for the thing being asserted, rather than for something that
   * usually arrives at the same time.
   */
  async waitForText(phrase, opts) {
    await this.waitFor(
      `document.body.innerText.includes(${JSON.stringify(phrase)})`,
      { label: `the text ${JSON.stringify(phrase)}`, ...opts },
    );
    return this.text();
  }

  /** Visible text of the whole page, whitespace-collapsed. */
  text() {
    return this.evaluate("return document.body.innerText.replace(/\\s+/g, ' ')");
  }

  url() {
    return this.evaluate("return location.pathname + location.search");
  }

  async click(selector) {
    await this.waitForInteractive(selector);
    await this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    `);
  }

  /**
   * Type into a React-controlled input.
   *
   * Assigning `.value` directly does not work: React tracks the previous value
   * on the DOM node and treats an assignment it did not make as no change, so
   * the component's state never updates and the form submits empty. Going
   * through the prototype's native setter is what makes React notice.
   */
  /**
   * Wait until React owns the element, not merely until it is in the document.
   *
   * `document.readyState === "complete"` means the HTML arrived; hydration
   * happens after it. An input filled in that gap keeps the value only until
   * React hydrates and resets it to its own initial state, and a button clicked
   * in that gap has no handler attached yet — the form simply does nothing.
   * Locally the window is a few milliseconds wide, which is why this showed up
   * as one test failing about one run in three rather than as an obvious bug.
   *
   * React marks every host node it has hydrated with a `__reactFiber$…` key.
   * Waiting for that on the specific element is the precise question — "will my
   * event be heard?" — rather than a sleep long enough to usually work.
   */
  async waitForInteractive(selector) {
    await this.waitForSelector(selector);
    // waitFor() wraps its argument in Boolean(...), so this has to be a single
    // expression rather than a block.
    await this.waitFor(
      `Object.keys(document.querySelector(${JSON.stringify(selector)}) ?? {})` +
        `.some((k) => k.startsWith("__react"))`,
      { label: `React to hydrate ${selector}` },
    );
  }

  async fill(selector, value) {
    await this.waitForInteractive(selector);
    await this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    `);
  }

  async select(selector, value) {
    await this.waitForInteractive(selector);
    await this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    `);
  }

  /** A PNG of the current page, written where a person can actually look. */
  async screenshot(path) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, Buffer.from(data, "base64"));
    return path;
  }

  async close() {
    try { this.#ws?.close(); } catch { /* already gone */ }

    // Wait for Chrome to actually exit before touching its profile. Killing the
    // process returns immediately, and a browser that is still flushing its
    // profile to disk makes the delete below fail with ENOTEMPTY — which then
    // fails the test that had just passed.
    if (this.#proc && this.#proc.exitCode === null) {
      this.#proc.kill();
      await new Promise((resolve) => {
        const done = setTimeout(resolve, 5_000);
        this.#proc.once("exit", () => { clearTimeout(done); resolve(); });
      });
    }

    // Best effort: a leftover directory in /tmp is untidy, never a test result.
    try { if (this.#profileDir) rmSync(this.#profileDir, { recursive: true, force: true }); }
    catch { /* the OS will reap it */ }
  }
}
