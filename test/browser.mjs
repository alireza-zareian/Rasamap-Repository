// A small browser driver over the Chrome DevTools Protocol: navigate, wait,
// click, type, read, screenshot.
//
// Not Playwright: `playwright install` downloads a browser build from a CDN
// that was not reachable from the development machine. This drives the Chrome
// already installed (the one docs/thesis/build.py prints with) over Node's
// global WebSocket, with no dependency.

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
 * A distinct client address per browser, as test/helpers.mjs gives each API
 * request. From one shared address the deliberate wrong-password test spends
 * the brute-force budget (§8) the later sign-ins need.
 */
let ipCounter = 0;
function uniqueIp() {
  ipCounter += 1;
  const n = ipCounter;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

/** Where goto() marks the document it is leaving. */
const NAV_STAMP = "__rasamapNav";

/** Headless Chrome's own user agent is on proxy.ts's BLOCK_UA list (§20). */
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
        // 0: the kernel picks a free port and Chrome writes it to
        // DevToolsActivePort. A port chosen here could belong to the previous
        // test's Chrome, still shutting down, and the test would drive its page.
        "--remote-debugging-port=0",
        `--window-size=${width},${height}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    // A Chrome that will not die must not keep this process alive. CI run 28
    // sat in the browser step for over an hour; a child outliving its test
    // holds Node's event loop open in exactly that way.
    b.#proc.unref();

    try {
      await b.#connect(width, height);
    } catch (err) {
      await b.close();
      throw err;
    }
    return b;
  }

  /** Find Chrome's page target and open the DevTools socket; every wait is bounded. */
  async #connect(width, height) {
    const b = this;

    // Chrome writes DevToolsActivePort once it has bound; poll for it rather
    // than guessing how long that takes on a loaded machine.
    const portFile = join(b.#profileDir, "DevToolsActivePort");
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
        const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2_000) });
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
      const late = setTimeout(() => reject(new Error("CDP socket did not open")), 10_000);
      b.#ws.addEventListener("open", () => { clearTimeout(late); resolve(); }, { once: true });
      b.#ws.addEventListener("error", () => { clearTimeout(late); reject(new Error("CDP socket failed")); }, { once: true });
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
   * Arrive from a different address from here on — for a test that makes more
   * than one failed sign-in, which would otherwise read the rate-limit message
   * (§8) instead of the rejection it asserts.
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
    // Page.navigate resolves once the request is sent, while the previous
    // document is still "complete". So stamp the current window and wait for a
    // complete document without the stamp — not for the requested URL, since
    // a redirect (/admin → /admin/login) is sometimes what a test checks.
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
   * A selector wait is not enough: for a few frames the streamed content and
   * the loading.tsx fallback are both in the DOM.
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
   * Wait until React has hydrated the element: before that, a filled value is
   * reset and a click has no handler. React marks each hydrated node with a
   * `__reactFiber$…` key.
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

  /**
   * Type into a React-controlled input. A plain `.value =` is ignored by React,
   * which tracks the previous value on the node; the prototype's native setter
   * is not.
   */
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

  /**
   * Put files into an <input type="file">, as picking them in the dialog would.
   * The input may be hidden — the wizard's is, behind its own button — since
   * DevTools sets the files directly and fires the change event.
   */
  async setFiles(selector, paths) {
    await this.waitForSelector(selector);
    const { root } = await this.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await this.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    await this.send("DOM.setFileInputFiles", { nodeId, files: paths });
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

    // Wait for Chrome to exit: deleting a profile it is still flushing fails
    // with ENOTEMPTY.
    // SIGTERM first, then SIGKILL if it is still there after five seconds.
    const exited = () => this.#proc.exitCode !== null || this.#proc.signalCode !== null;
    const waitExit = (ms) => new Promise((resolve) => {
      if (exited()) return resolve();
      const done = setTimeout(resolve, ms);
      this.#proc.once("exit", () => { clearTimeout(done); resolve(); });
    });
    if (this.#proc && !exited()) {
      this.#proc.kill("SIGTERM");
      await waitExit(5_000);
      if (!exited()) {
        this.#proc.kill("SIGKILL");
        await waitExit(2_000);
      }
    }

    // Best effort: a leftover directory in /tmp is untidy, never a test result.
    try { if (this.#profileDir) rmSync(this.#profileDir, { recursive: true, force: true }); }
    catch { /* the OS will reap it */ }
  }
}
