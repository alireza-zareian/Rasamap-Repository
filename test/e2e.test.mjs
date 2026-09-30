// Browser flows: that the server's answers become a usable page — the form
// submits, the filter bar filters, the compare tray appears. Run with
// `npm run test:e2e`; test/run-e2e.mjs builds, serves on its own port and
// database, and tears down (§22b: a production build, never `next dev`).
// A failure leaves a screenshot in test/screenshots/.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Browser } from "./browser.mjs";
import { recoverOtpCode, randomPhone } from "./helpers.mjs";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3200";
const SHOTS = join(process.cwd(), "test", "screenshots");
mkdirSync(SHOTS, { recursive: true });

/** Fixture accounts from test/seed.mjs. */
const USER = { phone: "09120000000", password: "secret123", name: "Ali Tester" };

/** A real PNG on disk, for the photo picker (DevTools sets files by path). */
const PHOTO = join(tmpdir(), "rasamap-e2e-photo.png");
writeFileSync(PHOTO, Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
));

/** The one sentence a refused sign-in is allowed to say — app/api/auth/login. */
const DENIED = "شماره/ایمیل یا رمز عبور اشتباه است";

/** Run a body with a fresh browser, and screenshot whatever state it died in. */
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

test("typing on while a search is still loading keeps every keystroke", async () => {
  await withBrowser("catalogue-typing", async (b) => {
    await b.goto(`${BASE}/explore`);
    await b.waitForInteractive("input[aria-label='جستجو']");
    // A phone on a weak connection: each navigation lands 700 ms after it leaves.
    await b.send("Network.emulateNetworkConditions", { offline: false, latency: 700, downloadThroughput: -1, uploadThroughput: -1 });
    // Text input as a phone keyboard sends it, one character at a time.
    await b.evaluate(`document.querySelector("input[aria-label='جستجو']").focus(); return true;`);
    const type = async (text, gap) => {
      for (const ch of text) {
        await b.send("Input.insertText", { text: ch });
        await new Promise(r => setTimeout(r, gap));
      }
    };
    await type("تهران", 50);
    await new Promise(r => setTimeout(r, 500)); // the pause sends «تهران»; it is still in flight
    await type(" ونک", 250);                    // and lands while these keys go in
    await b.waitFor("new URLSearchParams(location.search).get('search') === 'تهران ونک'", { label: "the whole search in the URL" });
    const value = await b.evaluate(`return document.querySelector("input[aria-label='جستجو']").value;`);
    assert.equal(value, "تهران ونک");
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

    // The session survives a fresh load — what a wrong Secure/SameSite breaks
    // (§24). waitForText: /dashboard shows a checking state until
    // /api/auth/session answers (§31).
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

    // A wrong password and an unknown number read the same on screen.
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
    // echo it with OTP_DEV_ECHO=1, which the demo laptop turns on and
    // test/run-e2e.mjs forces off, so the flow is proven without it.
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
test("an owner can submit a listing with a photo and see it as pending", async () => {
  await withBrowser("submit-listing", async (b) => {
    await b.goto(`${BASE}/login`);
    await b.fill("input[type='tel']", USER.phone);
    await b.fill("input[type='password']", USER.password);
    await b.click("button[type='submit']");
    await b.waitFor("!location.pathname.startsWith('/login')");

    // The submission wizard is the surface a real owner meets first. It is a
    // six-step wizard rather than a <form>, so wait for the step rail.
    await b.goto(`${BASE}/list-media`);
    await b.waitForText("اطلاعات اصلی", { label: "the submission wizard" });

    // Step one refuses to advance until its required fields are filled — the
    // guard a real owner meets before anything reaches the database.
    await b.click("[data-testid='wizard-next']");
    await b.waitFor("document.querySelector('[role=alert]')", { label: "the step-one refusal" });

    const name = `بیلبورد مرورگر ${Date.now()}`;
    await b.fill("input[name='name']", name);
    await b.fill("input[name='phone']", "09120000000");
    await b.click("[data-testid='wizard-next']");

    await b.waitForSelector("input[name='location']");
    await b.fill("input[name='location']", "خیابان ولیعصر، روبه‌روی پارک ملت");
    await b.click("[data-testid='wizard-next']");

    await b.waitForSelector("input[name='width']");
    await b.fill("input[name='width']", "12");
    await b.fill("input[name='height']", "4");
    await b.fill("input[name='price']", "85");
    await b.click("[data-testid='wizard-next']");

    // A real photo through the real picker: the browser shrinks it on a canvas
    // before upload (lib/client/photos.ts), which no API test can exercise.
    await b.setFiles("input[type='file']", [PHOTO]);
    await b.waitFor("document.querySelectorAll('img[src^=\"blob:\"]').length === 1", { label: "the prepared photo preview" });
    await b.click("[data-testid='wizard-next']");

    await b.waitForText("پلن رایگان", { label: "the plan step" });
    await b.click("[data-testid='wizard-next']");
    await b.waitForText("با موفقیت ثبت شد", { label: "the confirmation", timeout: 30_000 });

    await b.goto(`${BASE}/dashboard`);
    await b.waitForText(name, { label: "the new listing on the dashboard" });
    assert.ok((await b.text()).includes("در انتظار تأیید"), "a new listing must be shown as pending");
  });
});

// ── 5. the panel ──────────────────────────────────────────────────────────
test("the admin login page refuses a customer's credentials", async () => {
  await withBrowser("admin-gate", async (b) => {
    await b.goto(`${BASE}/admin`);
    // An unauthenticated visitor must never see the panel, only the gate.
    const text = await b.text();
    assert.ok(!text.includes("صف تأیید"), "the admin panel rendered for a signed-out visitor");
  });
});

test("a reviewer signs in and moves between panel sections by their addresses", async () => {
  await withBrowser("admin-sections", async (b) => {
    // Staff use the same sign-in form as customers, on its staff tab.
    await b.goto(`${BASE}/login?as=staff`);
    await b.fill("input[type='email']", "admin@test.local");
    await b.fill("input[type='password']", "secret123");
    await b.click("button[type='submit']");
    await b.waitFor("location.pathname === '/admin'", { label: "the panel overview after a staff sign-in" });
    await b.waitFor("document.body.innerText.includes('نمای کلی داشبورد')", { label: "the server-rendered counters" });

    // The menu is links now: each section is an address of its own.
    await b.click("a[href='/admin/listings']");
    await b.waitFor("location.pathname === '/admin/listings'", { label: "the approval queue's address" });
    await b.waitFor("document.body.innerText.includes('Pending Listing')", { label: "the pending submission in the queue" });

    await b.click("a[href='/admin/leads']");
    await b.waitFor("location.pathname === '/admin/leads'", { label: "the leads section's address" });
  });
});

// ── phone width ─────────────────────────────────────────────────────────────
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

// ── a campaign survives the page it was made on ──────────────────────────
const PICKED = "[data-testid='billboard-card'] button[aria-label*='کمپین'][aria-pressed='true']";

test("a campaign pick survives a reload and becomes a shareable plan", async () => {
  await withBrowser("campaign-persists", async (b) => {
    await b.goto(`${BASE}/explore`);
    // The results hydrate in their own pass after loading.tsx; a click before
    // it is lost (2–5 runs in 10, measured). aria-busy says when they listen.
    await b.waitForSelector("[data-testid='results'][aria-busy='false']");
    // Two different cards: after the first click that card's button is renamed.
    await b.click("button[aria-label^='افزودن «'][aria-label$='به کمپین']");
    await b.waitForSelector(PICKED);
    await b.click("button[aria-label^='افزودن «'][aria-label$='به کمپین']");
    await b.waitFor(`document.querySelectorAll(${JSON.stringify(PICKED)}).length === 2`, { label: "two cards picked" });

    // /explore used to start from an empty list and save it on mount, so a
    // reload wiped the pick before anyone could use it.
    await b.goto(`${BASE}/explore`);
    await b.waitFor(`document.querySelectorAll(${JSON.stringify(PICKED)}).length === 2`, { label: "the pick after a reload" });

    // An old /compare link lands on the planner, which moves to the plan's own
    // address — the link that is shared — and draws the side-by-side table.
    await b.goto(`${BASE}/compare`);
    await b.waitFor("location.pathname === '/campaign' && new URLSearchParams(location.search).get('m')?.split(',').length === 2",
      { label: "the plan's address" });
    await b.waitForText("بهترین در این معیار", { label: "the side-by-side table" });

    // Opened fresh, the address alone rebuilds the same plan.
    const url = await b.evaluate("return location.href");
    await b.evaluate("localStorage.clear(); return true");
    await b.goto(url);
    await b.waitForText("بهترین در این معیار", { label: "the plan from its link alone" });
  });
});

// ── saving a media item, from a guest's first tap ─────────────────────────
test("a guest's heart survives the sign-in it asks for, and lands on /saved", async () => {
  await withBrowser("favorites", async (b) => {
    await b.goto(`${BASE}/billboard/valiasr-tower`);
    // The heart on the page itself (the chip), not one on a related card.
    const heart = "button[aria-label='ذخیرهٔ «Valiasr Tower»']";
    await b.waitForSelector(heart);
    await b.click(heart);

    // A guest is sent to sign in, and back to the page afterwards.
    await b.waitFor("location.pathname === '/login'", { label: "the sign-in the heart asked for" });
    await b.fill("input[type='tel']", USER.phone);
    await b.fill("input[type='password']", USER.password);
    await b.click("button[type='submit']");
    await b.waitFor("location.pathname === '/billboard/valiasr-tower'", { label: "the way back to the media page" });

    // The tap made before signing in is made now, without a second one.
    await b.waitForSelector("button[aria-label='حذف «Valiasr Tower» از ذخیره‌شده‌ها'][aria-pressed='true']");

    await b.goto(`${BASE}/saved`);
    await b.waitFor("document.body.innerText.includes('Valiasr Tower')", { label: "the saved item on /saved" });

    // Unsaved here, its card leaves at once — and stays gone after a reload.
    await b.click("button[aria-label='حذف «Valiasr Tower» از ذخیره‌شده‌ها']");
    await b.waitForText("هنوز چیزی ذخیره نکرده‌اید", { label: "the empty list" });
    await b.goto(`${BASE}/saved`);
    await b.waitForText("هنوز چیزی ذخیره نکرده‌اید", { label: "the empty list after a reload" });
  });
});
