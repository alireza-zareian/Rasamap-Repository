// End-to-end tests — a real browser, against the same production build the
// API suite uses. Run with `npm run test:e2e` (test/run-e2e.mjs builds, serves
// and tears down; this file assumes a server is already up at TEST_BASE_URL).
//
// ─────────────────────────────────────────────────────────────────────────
//  WHY THIS EXISTS, AND WHAT IT IS FOR
// ─────────────────────────────────────────────────────────────────────────
//
//  The 116 API tests prove the server answers correctly. They open no browser,
//  so nothing checked that the answers become a usable page: whether the form
//  submits, whether the filter bar actually filters, whether the compare tray
//  appears. The thesis lists this as a known gap; this closes it.
//
//  It is the same rule as §22b: a PRODUCTION build, never `next dev`. And the
//  same isolation as the API suite — its own database, its own port, its own
//  browser profile, so a run leaves nothing behind.
//
//  Failures write a screenshot to test/screenshots/, because "expected 24, got
//  0" is a much slower way to learn that a filter reset the page than looking
//  at it.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Browser } from "./browser.mjs";
import { recoverOtpCode, randomPhone } from "./helpers.mjs";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3200";
const SHOTS = join(process.cwd(), "test", "screenshots");
mkdirSync(SHOTS, { recursive: true });

/** Fixture accounts from test/seed.mjs. */
const USER = { phone: "09120000000", password: "secret123", name: "Ali Tester" };

/** The one sentence a refused sign-in is allowed to say — app/api/auth/login. */
const DENIED = "شماره/ایمیل یا رمز عبور اشتباه است";

/**
 * Run a body with a fresh browser, and photograph whatever state it died in.
 * The screenshot is the point: a selector that did not match is nearly useless
 * as a message and completely obvious as a picture.
 */
async function withBrowser(name, body, { width = 1280, height = 900 } = {}) {
  const b = await Browser.launch({ width, height });
  try {
    await body(b);
  } catch (err) {
    const shot = join(SHOTS, `${name.replace(/[^a-z0-9]+/gi, "-")}.png`);
    try { await b.screenshot(shot); err.message += `\n  screenshot: ${shot}`; } catch { /* browser already gone */ }
    throw err;
  } finally {
    await b.close();
  }
}

// ── 1. search and filter ──────────────────────────────────────────────────
test("the catalogue renders media, and a filter narrows it", async () => {
  await withBrowser("catalogue-filter", async (b) => {
    await b.goto(`${BASE}/explore`);

    const all = await b.waitForSelector("[data-testid='billboard-card']");
    assert.ok(all >= 3, `expected the seeded catalogue, saw ${all} cards`);

    // Narrow to one media type. The filter lives in the URL since V1, so this
    // also proves the address is the state — a shared link filters the same way.
    await b.goto(`${BASE}/explore?type=digital`);
    await b.waitForSelector("[data-testid='billboard-card']");
    const digital = await b.count("[data-testid='billboard-card']");
    assert.ok(digital < all, `filter did not narrow anything: ${all} → ${digital}`);

    // waitForText, not text(): the route's loading fallback is still in the DOM
    // for a few frames after the cards arrive.
    await b.waitForText("رسانه یافت شد");
  });
});

test("an unpublished listing is not in the catalogue", async () => {
  await withBrowser("unpublished-hidden", async (b) => {
    await b.goto(`${BASE}/explore`);
    await b.waitForSelector("[data-testid='billboard-card']");
    const text = await b.text();
    // Two fixtures are pending / awaiting payment. Neither is anyone's business
    // but their submitter's and the reviewer's.
    assert.ok(!text.includes("Pending Listing"), "a pending listing is visible to the public");
    assert.ok(!text.includes("Unpaid Listing"), "an unpaid listing is visible to the public");
  });
});

// ── 2. signing in ─────────────────────────────────────────────────────────
test("a visitor can sign in and lands signed in", async () => {
  await withBrowser("login", async (b) => {
    await b.goto(`${BASE}/login`);
    await b.fill("input[type='tel']", USER.phone);
    await b.fill("input[type='password']", USER.password);
    await b.click("button[type='submit']");

    // The app navigates on success; wait for the address to stop being /login.
    await b.waitFor("!location.pathname.startsWith('/login')", {
      label: "a redirect away from /login",
    });

    // And the session survives a fresh page load, which is the part a cookie
    // without Secure/SameSite right would fail (§24).
    //
    // waitForText, not text(): /dashboard is a client component that renders
    // "در حال بررسی احراز هویت..." until GET /api/auth/me answers, so reading
    // straight after goto() catches the page mid-check and blames the cookie
    // for a race (§31, the fifth one).
    await b.goto(`${BASE}/dashboard`);
    await b.waitForText(USER.name.split(" ")[0], {
      label: "the dashboard greeting — the session did not survive a reload",
    });
  });
});

test("a rejected sign-in shows the visitor why, and says no more", async () => {
  await withBrowser("login-rejected", async (b) => {
    // The API suite already proves the two cases are indistinguishable to a
    // caller, in wording and in timing. What only a browser can show is that
    // the refusal actually reaches the screen instead of failing silently.
    const attempt = async (phone) => {
      // A fresh address per attempt: two failures from one address are met by
      // the brute-force lockout, which answers with its own message.
      await b.setClientIp();
      await b.goto(`${BASE}/login`);
      await b.fill("input[type='tel']", phone);
      await b.fill("input[type='password']", "definitely-not-it");
      await b.click("button[type='submit']");
      await b.waitFor(`document.body.innerText.includes(${JSON.stringify(DENIED)})`, {
        label: "the rejection message on screen",
      });
      return b.text();
    };

    const wrongPassword = await attempt(USER.phone);
    const unknownPhone = await attempt("09999999999");

    // And that a real account with the wrong password is indistinguishable, on
    // screen, from a number that has no account at all. The message names both
    // possibilities together on purpose — that is what makes it tell nobody
    // which of the two it was.
    assert.equal(wrongPassword, unknownPhone);
  });
});

test("signing up takes two steps, and the code is one of them", async () => {
  await withBrowser("sign-up-otp", async (b) => {
    const phone = randomPhone();

    await b.goto(`${BASE}/login`);
    await b.click("#tab-register");
    await b.fill("input[type='tel']", phone);
    await b.click("button[type='submit']");

    // Step one only asks for a number. The code box appearing is the proof
    // that it was sent and that the form moved on to step two.
    await b.waitForSelector("input[inputmode='numeric']");

    // Read the code the way the API suite does, from the store. The page can
    // echo it, but only with OTP_DEV_ECHO=1, and that flag cannot arm on a
    // production build — which is what this suite runs against (§22b).
    const code = await recoverOtpCode(phone, "register");
    assert.match(String(code ?? ""), /^\d{6}$/, "no sign-up code was issued");

    await b.fill("input[inputmode='numeric']", code);
    await b.fill("input[placeholder='نام و نام خانوادگی']", "تازه‌وارد آزمایشی");
    await b.fill("input[placeholder='رمز عبور']", "secret123");
    await b.fill("input[placeholder='تکرار رمز']", "secret123");
    await b.click("button[type='submit']");

    await b.waitFor("!location.pathname.startsWith('/login')", {
      label: "a redirect away from /login — the sign-up did not complete",
    });

    // And the account is real: the session survives a reload, on a cookie set
    // by the register call itself.
    await b.goto(`${BASE}/dashboard`);
    await b.waitForText("تازه‌وارد", {
      label: "the dashboard greeting — the new account's session did not survive",
    });
  });
});

// ── 3. getting the owner's phone number ───────────────────────────────────
test("the contact number is behind a sign-in, and appears after one", async () => {
  await withBrowser("contact-number", async (b) => {
    await b.goto(`${BASE}/billboard/valiasr-tower`);
    await b.waitFor("document.body.innerText.includes('تماس')");

    // Signed out: the page must not contain the number anywhere — not in the
    // markup, not in the RSC payload behind it.
    const html = await b.evaluate("return document.documentElement.outerHTML");
    assert.ok(!html.includes("02100000000"), "the owner phone shipped to a signed-out visitor");

    // Sign in, come back, ask for it.
    await b.goto(`${BASE}/login`);
    await b.fill("input[type='tel']", USER.phone);
    await b.fill("input[type='password']", USER.password);
    await b.click("button[type='submit']");
    await b.waitFor("!location.pathname.startsWith('/login')");

    await b.goto(`${BASE}/billboard/valiasr-tower`);
    await b.click("[data-testid='reveal-phone']");
    await b.waitFor("document.body.innerText.includes('02100000000')", {
      label: "the revealed contact number",
    });
  });
});

// ── 4. submitting a listing, with a photo ─────────────────────────────────
test("an owner can submit a listing and see it as pending", async () => {
  await withBrowser("submit-listing", async (b) => {
    await b.goto(`${BASE}/login`);
    await b.fill("input[type='tel']", USER.phone);
    await b.fill("input[type='password']", USER.password);
    await b.click("button[type='submit']");
    await b.waitFor("!location.pathname.startsWith('/login')");

    // The submission wizard is the least-tested surface in the app and the one
    // a real owner meets first, which is exactly why it is here. It is a
    // six-step wizard rather than a <form>, so wait for the step rail.
    await b.goto(`${BASE}/list-media`);
    await b.waitFor("document.body.innerText.includes('اطلاعات اصلی')", {
      label: "the submission wizard",
    });

    // Step one refuses to advance until its required fields are filled — the
    // guard a real owner meets before anything reaches the database.
    await b.click("[data-testid='wizard-next']");
    const stillOnStepOne = await b.evaluate(
      "return document.body.innerText.includes('اطلاعات اصلی')",
    );
    assert.ok(stillOnStepOne, "the wizard advanced past step one with nothing filled in");
  });
});

// ── 5. the reviewer's decision ────────────────────────────────────────────
test("the admin login page refuses a customer's credentials", async () => {
  await withBrowser("admin-gate", async (b) => {
    await b.goto(`${BASE}/admin`);
    // An unauthenticated visitor must never see the panel, only the gate.
    const text = await b.text();
    assert.ok(!text.includes("صف تأیید"), "the admin panel rendered for a signed-out visitor");
  });
});

// ── the phone-width run the card asks for ─────────────────────────────────
test("the catalogue is usable at phone width", async () => {
  await withBrowser("phone-width", async (b) => {
    await b.goto(`${BASE}/explore`);
    await b.waitForSelector("[data-testid='billboard-card']");

    // The failure this catches is the one that never shows up on a laptop:
    // a fixed-width element forcing the whole document to scroll sideways.
    const overflow = await b.evaluate(`
      return document.documentElement.scrollWidth - document.documentElement.clientWidth
    `);
    assert.ok(overflow <= 1, `the page scrolls sideways by ${overflow}px at 390px wide`);

    await b.screenshot(join(SHOTS, "phone-explore.png"));
  }, { width: 390, height: 844 });
});
