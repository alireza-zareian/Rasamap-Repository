// API integration tests — run via `npm test` (see test/run.mjs).
// Covers: input validation, sort/param allowlists, rate limiting, absence of
// user enumeration, the listing submission pipeline (upload validation and the
// approval state machine), object-level authorisation, and the anti-scraping
// limits.
//
// ─────────────────────────────────────────────────────────────────────────
//  READ THIS BEFORE TOUCHING THE TEST SETUP
// ─────────────────────────────────────────────────────────────────────────
//
//  1. `npm test` already builds and serves a PRODUCTION server (next build +
//     next start on :3100, into .next-test/). Do not "fix" a slow run by
//     pointing it at `next dev`. That is where it started, and it did not
//     merely cost the ~97x CPU of §22: one test reads the catalogue 120 times
//     in a row, which under `next dev` pushed a single request past undici's
//     300-second header timeout, wedged the server, and made the last ~20
//     tests fail for reasons that had nothing to do with them. Whole suite:
//     >20 min and never finishing, versus ~37 s and 113/113 green.
//
//  2. Nothing in here waits on an external service. The SMS layer is dormant
//     without KAVENEGAR_API_KEY (lib/sms.ts, §16), so the OTP tests issue and
//     read codes entirely inside the local database — no message is ever
//     sent and nothing polls for one. If an OTP test appears to hang, the
//     cause is the server, not an SMS.
//
//  3. Every request aborts after 30 s (test/helpers.mjs). A run that stalls
//     will say so in seconds. If you are waiting minutes, something outside
//     this file is wrong — check that the build step succeeded.
//
//  4. Run it with `npm test` and nothing else. It resets and seeds its own
//     database (prisma/test.db) and never reads or writes dev.db.
//
//  Full reasoning: docs/engineering-decisions.md §22b, and test/README.md.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BASE, api, mintSession, tokenFromSetCookie, uniqueIp, randomPhone, pngDataUrl, fakeImageDataUrl, recoverOtpCode, countOtpRows, registerUser } from "./helpers.mjs";

// ── Public billboards API ──────────────────────────────────────────────

test("GET /api/billboards returns the paginated shape", async () => {
  const { status, json } = await api("/api/billboards?limit=2");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.length <= 2);
  assert.equal(typeof json.total, "number");
  assert.equal(typeof json.totalPages, "number");
});

test("GET /api/billboards rejects a value outside the sort allowlist", async () => {
  const { status } = await api("/api/billboards?sortBy=price_asc;DROP%20TABLE");
  assert.equal(status, 400);
});

test("GET /api/billboards rejects an oversized limit", async () => {
  const { status } = await api("/api/billboards?limit=99999");
  assert.equal(status, 400);
});

test("GET /api/billboards caps the page size at 48 (bulk-copy limit)", async () => {
  assert.equal((await api("/api/billboards?limit=48")).status, 200);
  assert.equal((await api("/api/billboards?limit=49")).status, 400);
});

test("GET /api/billboards never returns an unpublished listing", async () => {
  const { json } = await api("/api/billboards?limit=48");
  const slugs = json.items.map((b) => b.slug);
  assert.ok(!slugs.includes("pending-listing"), "a pending listing must stay hidden");
  assert.ok(!slugs.includes("unpaid-listing"), "an unpaid listing must stay hidden");
});

test("GET /api/billboards cannot be tricked into revealing rows in review", async () => {
  // A review state is not an availability, so asking for one is refused outright…
  assert.equal((await api("/api/billboards?availability=pending&limit=48")).status, 400);
  // …and a parameter the route does not know is ignored, never obeyed.
  const { json } = await api("/api/billboards?moderation=pending&status=pending&limit=48");
  const slugs = (json.items ?? []).map((b) => b.slug);
  assert.ok(!slugs.includes("pending-listing"));
});

/**
 * Every catalogue sort is the composite (featured desc, hasImages desc, metric
 * desc) — a paid listing outranks a photographed one, which outranks a bare
 * record. Asserting the tuple is non-increasing checks the real contract; a
 * bare "is the metric descending?" would fail on correct output, and comparing
 * only inside one group would pass even if the metric were ignored entirely.
 */
function assertSortedBy(items, metric) {
  const key = (b) => [b.featured ? 1 : 0, (b.images?.length ?? 0) > 0 ? 1 : 0, metric(b)];
  for (let i = 1; i < items.length; i++) {
    const prev = key(items[i - 1]);
    const cur  = key(items[i]);
    const ok = prev[0] > cur[0]
      || (prev[0] === cur[0] && prev[1] > cur[1])
      || (prev[0] === cur[0] && prev[1] === cur[1] && prev[2] >= cur[2]);
    assert.ok(ok, `row ${i} breaks the order: ${JSON.stringify(prev)} then ${JSON.stringify(cur)}`);
  }
}

test("sortBy=traffic_desc orders by estimated views, not by rating", async () => {
  const { status, json } = await api("/api/billboards?sortBy=traffic_desc&limit=48");
  assert.equal(status, 200);
  // Guard against a vacuous pass: the fixtures must actually differ.
  const views = json.items.map((b) => b.traffic?.estimatedViews ?? 0);
  assert.ok(new Set(views).size > 1, "fixtures all share one view count — the assertion would prove nothing");
  assertSortedBy(json.items, (b) => b.traffic?.estimatedViews ?? 0);
});

test("sortBy=area_desc orders by width x height, not by width alone", async () => {
  const { status, json } = await api("/api/billboards?sortBy=area_desc&limit=48");
  assert.equal(status, 200);
  const areas = json.items.map((b) => b.width * b.height);
  assert.ok(new Set(areas).size > 1, "fixtures all share one area — the assertion would prove nothing");
  assertSortedBy(json.items, (b) => b.width * b.height);
});

test("a scraper user-agent is refused on the public API", async () => {
  const { status } = await api("/api/billboards", { headers: { "user-agent": "python-requests/2.31.0" } });
  assert.equal(status, 403);
});

// ── Health ────────────────────────────────────────────────────────────────
// The endpoint a reverse proxy, systemd or an uptime pinger asks before it
// decides the site is up.

test("GET /api/health reports ok and says nothing else", async () => {
  const { status, json } = await api("/api/health");
  assert.equal(status, 200);
  // Bare on purpose: a public endpoint that reports the engine, the version or
  // the uptime is a fingerprint handed to whoever asks.
  assert.deepEqual(json, { status: "ok" });
});

test("health answers the user agents that actually poll it", async () => {
  // The bot filter that (correctly) refuses python-requests on the catalogue
  // above would refuse every one of these, and a liveness check that only
  // answers browsers reports the site as down the moment it is deployed.
  for (const ua of ["curl/8.4.0", "kube-probe/1.29", "Go-http-client/2.0", ""]) {
    const { status } = await api("/api/health", { headers: { "user-agent": ua } });
    assert.equal(status, 200, `health refused user-agent ${JSON.stringify(ua)}`);
  }
});

test("health is never cached", async () => {
  // A cached health check reports the health of the cache.
  const { headers } = await api("/api/health");
  assert.match(headers.get("cache-control") ?? "", /no-store/);
});

test("GET /api/billboards rejects an unknown type", async () => {
  const { status } = await api("/api/billboards?type=notatype");
  assert.equal(status, 400);
});

test("GET /api/billboards/[slug] returns a single billboard", async () => {
  const { status, json } = await api("/api/billboards/valiasr-tower");
  assert.equal(status, 200);
  assert.equal(json.billboard.slug, "valiasr-tower");
});

test("GET /api/billboards/[slug] is 404 for an unknown slug", async () => {
  const { status } = await api("/api/billboards/no-such-billboard");
  assert.equal(status, 404);
});

test("GET /api/billboards/[slug] is 404 for a listing awaiting approval", async () => {
  // The slug exists, but the row is unpublished — it must not be readable by
  // guessing the URL, the way it is hidden from search and the sitemap.
  assert.equal((await api("/api/billboards/pending-listing")).status, 404);
  assert.equal((await api("/api/billboards/unpaid-listing")).status, 404);
});

test("GET /api/billboards/[slug] is 400 for a malformed slug", async () => {
  const { status } = await api("/api/billboards/Bad_Slug!");
  assert.equal(status, 400);
});

test("GET /api/billboards/[slug] never includes the owner phone", async () => {
  const { json } = await api("/api/billboards/valiasr-tower");
  assert.equal(json.billboard.phone, undefined);
});

test("POST /api/billboards/[slug]/contact is 401 without a session", async () => {
  const { status } = await api("/api/billboards/valiasr-tower/contact", { method: "POST" });
  assert.equal(status, 401);
});

test("POST /api/billboards/[slug]/contact returns the phone to a signed-in user", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status, json } = await api("/api/billboards/valiasr-tower/contact", { method: "POST", token });
  assert.equal(status, 200);
  assert.equal(typeof json.phone, "string");
});

test("phone reveals are limited per account, whatever address they come from", async () => {
  // A staff session, so the loop records no leads for the tests that count them.
  const token = await mintSession({ role: "viewer" });
  let last;
  for (let i = 0; i < 41; i++) {
    last = await api("/api/billboards/valiasr-tower/contact", { method: "POST", token, ip: uniqueIp() });
  }
  assert.equal(last.status, 429);
});

test("POST /api/billboards/[slug]/contact 404s on an unpublished listing", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status } = await api("/api/billboards/pending-listing/contact", { method: "POST", token });
  assert.equal(status, 404);
});

// ── Review edit and delete ──────────────────────────────────────

test("a user can edit their own review, and the average follows", async () => {
  const token = await mintSession({ userId: "2", role: "user" });
  const post = (rating, comment) =>
    api("/api/reviews", { method: "POST", token, body: { billboardId: 2, rating, comment } });

  assert.equal((await post(5, "رسانهٔ بسیار خوبی بود و بازخورد گرفتیم")).status, 201);
  assert.equal((await post(2, "بعد از یک ماه نظرم عوض شد، بازدهی نداشت")).status, 201);

  const { json } = await api("/api/reviews?billboardId=2");
  const mine = json.reviews.filter(r => r.userId === 2);
  assert.equal(mine.length, 1, "editing must replace the review, not add a second");
  assert.equal(mine[0].rating, 2);
  assert.equal(json.avg, 2, "the average has to follow the edit");
});

test("a user can delete their own review and the billboard average is recomputed", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const created = await api("/api/reviews", {
    method: "POST", token, body: { billboardId: 6, rating: 4, comment: "نظری برای حذف کردن در تست" },
  });
  assert.equal(created.status, 201);
  const id = created.json.review.id;

  const { status } = await api(`/api/reviews/${id}`, { method: "DELETE", token });
  assert.equal(status, 200);

  const after = await api("/api/reviews?billboardId=6");
  assert.ok(!after.json.reviews.some(r => r.id === id), "the review is still listed");
  assert.equal(after.json.avg, null, "with no reviews left the average must clear");
});

test("a user cannot delete someone else's review", async () => {
  const owner = await mintSession({ userId: "1", role: "user" });
  const other = await mintSession({ userId: "2", role: "user" });
  const created = await api("/api/reviews", {
    method: "POST", token: owner,
    body: { billboardId: 3, rating: 5, comment: "نظری که فقط صاحبش حق حذفش را دارد" },
  });
  assert.equal(created.status, 201);
  const id = created.json.review.id;

  // 404 rather than 403: telling a stranger the id exists is itself a leak.
  assert.equal((await api(`/api/reviews/${id}`, { method: "DELETE", token: other })).status, 404);
  assert.equal((await api(`/api/reviews/${id}`, { method: "DELETE" })).status, 401);

  const still = await api("/api/reviews?billboardId=3");
  assert.ok(still.json.reviews.some(r => r.id === id), "the review must survive both attempts");
});

// ── Staff powers on the public site ─────────────────────────────
// The page is rendered on the server, so the check has to happen there. These
// assert the shape that matters: a stranger cannot reach an unpublished listing
// by any means, and a reviewer can.

test("an unpublished listing stays a 404 for a guest and for a customer", async () => {
  const customer = await mintSession({ userId: "1", role: "user" });
  for (const slug of ["pending-listing", "unpaid-listing"]) {
    assert.equal((await api(`/billboard/${slug}`)).status, 404, `${slug} leaked to a guest`);
    assert.equal((await api(`/billboard/${slug}`, { token: customer })).status, 404, `${slug} leaked to a customer`);
    // and still not through the API, whoever asks
    assert.equal((await api(`/api/billboards/${slug}`, { token: customer })).status, 404);
  }
});

test("a staff session may preview an unpublished listing, and is told it is one", async () => {
  const staff = await mintSession({ role: "editor" });
  const { status, json: html } = await api("/billboard/pending-listing", { token: staff });
  assert.equal(status, 200, "a reviewer must be able to open a submission");
  assert.ok(html.includes("پیش‌نمایش همکاران"), "the preview banner is missing");
  assert.ok(html.includes("در انتظار تأیید"), "the banner must name the real status");
});

test("the staff preview does not open the API as a side door", async () => {
  // Only the page was relaxed. The JSON endpoint stays shut, so nothing that
  // consumes the API can be handed an unpublished row by accident.
  const staff = await mintSession({ role: "admin" });
  assert.equal((await api("/api/billboards/pending-listing", { token: staff })).status, 404);
});

test("admin search finds a row by its slug", async () => {
  const staff = await mintSession({ role: "editor" });
  const { status, json } = await api("/api/admin/billboards?q=valiasr-tower&limit=20", { token: staff });
  assert.equal(status, 200);
  assert.ok(json.items.some(b => b.slug === "valiasr-tower"), "pasting a slug must find the row");
});

// ── Review replies ──────────────────────────────────────────────

test("anyone signed in can reply to a review, and staff replies are badged", async () => {
  const author = await mintSession({ userId: "1", role: "user" });
  const other  = await mintSession({ userId: "2", role: "user" });
  const staff  = await mintSession({ role: "admin", name: "پشتیبانی" });

  const review = await api("/api/reviews", {
    method: "POST", token: author,
    body: { billboardId: 1, rating: 4, comment: "نظری که قرار است پاسخ بگیرد" },
  });
  assert.equal(review.status, 201);
  const id = review.json.review.id;

  assert.equal((await api(`/api/reviews/${id}/replies`, { method: "POST", token: other, body: { body: "منم همین تجربه را داشتم" } })).status, 201);
  assert.equal((await api(`/api/reviews/${id}/replies`, { method: "POST", token: staff, body: { body: "ممنون از بازخوردتان" } })).status, 201);
  assert.equal((await api(`/api/reviews/${id}/replies`, { method: "POST", body: { body: "مهمان نباید بتواند" } })).status, 401);
  assert.equal((await api(`/api/reviews/${id}/replies`, { method: "POST", token: other, body: { body: "ک" } })).status, 400);

  const { json } = await api("/api/reviews?billboardId=1");
  const thread = json.reviews.find(r => r.id === id);
  assert.equal(thread.replies.length, 2, "both replies must come back with the review");
  assert.equal(thread.replies[0].isStaff, false, "oldest first — the customer replied first");
  assert.equal(thread.replies[1].isStaff, true);
  assert.equal(thread.replies[1].userId, null, "a staff reply stores no account id");
});

test("a reply can be removed by its author or by staff, but not by a stranger", async () => {
  const author = await mintSession({ userId: "1", role: "user" });
  const other  = await mintSession({ userId: "2", role: "user" });
  const staff  = await mintSession({ role: "admin" });

  const review = await api("/api/reviews", {
    method: "POST", token: author,
    body: { billboardId: 2, rating: 3, comment: "نظر دوم برای آزمودن حذف پاسخ" },
  });
  const reviewId = review.json.review.id;

  const mine = await api(`/api/reviews/${reviewId}/replies`, { method: "POST", token: other, body: { body: "پاسخی که خودم حذف می‌کنم" } });
  const theirs = await api(`/api/reviews/${reviewId}/replies`, { method: "POST", token: other, body: { body: "پاسخی که مدیر حذف می‌کند" } });

  // a third party gets the same answer as a missing row
  assert.equal((await api(`/api/reviews/${reviewId}/replies/${mine.json.reply.id}`, { method: "DELETE", token: author })).status, 404);
  assert.equal((await api(`/api/reviews/${reviewId}/replies/${mine.json.reply.id}`, { method: "DELETE", token: other })).status, 200);
  assert.equal((await api(`/api/reviews/${reviewId}/replies/${theirs.json.reply.id}`, { method: "DELETE", token: staff })).status, 200);

  const { json } = await api("/api/reviews?billboardId=2");
  assert.equal(json.reviews.find(r => r.id === reviewId).replies.length, 0);
});

test("a reply can only be deleted through the review it belongs to", async () => {
  const author = await mintSession({ userId: "1", role: "user" });
  const review = await api("/api/reviews", {
    method: "POST", token: author,
    body: { billboardId: 2, rating: 3, comment: "نظری برای آزمودن مسیر پاسخ" },
  });
  const reviewId = review.json.review.id;
  const reply = await api(`/api/reviews/${reviewId}/replies`, {
    method: "POST", token: author, body: { body: "پاسخ آزمایشی" },
  });
  const replyId = reply.json.reply.id;

  // The review in the path used to be ignored entirely, so this removed the
  // reply under a review id that does not exist at all.
  assert.equal(
    (await api(`/api/reviews/999999/replies/${replyId}`, { method: "DELETE", token: author })).status,
    404,
    "a reply was deleted through the wrong review",
  );
  // Through its own review it still works.
  assert.equal(
    (await api(`/api/reviews/${reviewId}/replies/${replyId}`, { method: "DELETE", token: author })).status,
    200,
  );
});

// ── One sign-in form, two kinds of account ──────────────────────

test("the public login accepts a staff email and hands back a staff session", async () => {
  const res = await api("/api/auth/login", {
    method: "POST", ip: uniqueIp(),
    body: { identifier: "admin@test.local", password: "admin123" },
  });
  // The test admin comes from env with a hash the suite does not know, so the
  // shape of the refusal is what matters: it must be the shared message, never
  // one that says "no such account".
  assert.ok([200, 401].includes(res.status), `unexpected ${res.status}`);
  if (res.status === 401) {
    assert.equal(res.json.error, "شماره/ایمیل یا رمز عبور اشتباه است");
  } else {
    assert.equal(res.json.user.isStaff, true);
  }
});

test("a wrong phone and a wrong email are refused in exactly the same words", async () => {
  const byPhone = await api("/api/auth/login", { method: "POST", ip: uniqueIp(), body: { identifier: "09190000001", password: "nope" } });
  const byEmail = await api("/api/auth/login", { method: "POST", ip: uniqueIp(), body: { identifier: "nobody@example.com", password: "nope" } });
  assert.equal(byPhone.status, 401);
  assert.equal(byEmail.status, 401);
  assert.equal(byPhone.json.error, byEmail.json.error, "the two stores must not be distinguishable from the response");
});

test("GET /api/auth/me answers for a staff session with isStaff", async () => {
  const staff = await mintSession({ role: "editor", name: "ویرایشگر" });
  const { status, json } = await api("/api/auth/me", { token: staff });
  assert.equal(status, 200);
  assert.equal(json.user.isStaff, true);
  assert.equal(json.user.role, "editor");

  const customer = await api("/api/auth/me", { token: await mintSession({ userId: "1", role: "user" }) });
  assert.equal(customer.json.user.isStaff, false);
});

// ── Related media ───────────────────────────────────────────────
// The suggestion strip used to match on `region`, a free-text neighbourhood
// label that is near-unique per row, so it matched nothing and every listing in
// the country fell through to one national list — the same dozen Tehran
// billboards under a Zanjan page. City comes first now.

test("suggestions prefer the same city over a higher-ranked one elsewhere", async () => {
  const { status, json: html } = await api("/billboard/valiasr-tower");
  assert.equal(status, 200);

  const strip = html.slice(html.indexOf("related-strip"));
  assert.ok(strip.length > 0, "the related strip is missing from the page");

  const suggested = [...new Set([...strip.matchAll(/href="\/billboard\/([a-z0-9-]+)"/g)].map(m => m[1]))];
  assert.ok(suggested.length > 0, "no suggestions were rendered");
  assert.ok(!suggested.includes("valiasr-tower"), "a listing must not suggest itself");

  // photo-board is in Shiraz and outranks the Tehran rows on images, so the city
  // ring has to win. Asserted as "the first suggestion is in the same city"
  // rather than by naming one slug: several fixtures share Tehran and which of
  // them ranks first is a detail of the sort, not the behaviour under test.
  // Naming one made this fail the moment the radial-search fixtures were added,
  // which said nothing about suggestions.
  const TEHRAN_SLUGS = ["inactive-board", "near-centre", "just-outside", "no-coords"];
  assert.ok(
    TEHRAN_SLUGS.includes(suggested[0]),
    `expected a same-city listing first, got ${suggested[0]}`,
  );
  assert.ok(!suggested.slice(0, TEHRAN_SLUGS.length - 1).includes("photo-board"),
    "a listing from another city was suggested ahead of the same-city ones");
});

test("suggestions never include an unpublished listing", async () => {
  const { json: html } = await api("/billboard/valiasr-tower");
  const strip = html.slice(html.indexOf("related-strip"));
  for (const hidden of ["pending-listing", "unpaid-listing"]) {
    assert.ok(!strip.includes(hidden), `${hidden} must stay out of the suggestions`);
  }
});

// ── Leads (the mini-CRM) ───────────────────────────────────────
// A reveal is the only demand signal Rasamap can observe, so the row it writes
// is what the admin leads panel reads.

test("revealing a phone records a lead the admin panel can see", async () => {
  const userToken  = await mintSession({ userId: "2", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  await api("/api/billboards/mashhad-digital/contact", { method: "POST", token: userToken });

  const { status, json } = await api("/api/admin/leads?limit=50", { token: adminToken });
  assert.equal(status, 200);
  const lead = json.leads.find(l => l.user?.id === 2 && l.billboard?.slug === "mashhad-digital");
  assert.ok(lead, "the reveal did not produce a lead row");
  assert.equal(lead.status, "new");
});

test("a second reveal by the same user increments the count instead of adding a row", async () => {
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });
  const slug = "photo-board";

  await api(`/api/billboards/${slug}/contact`, { method: "POST", token: userToken });
  const first = await api("/api/admin/leads?limit=50", { token: adminToken });
  const before = first.json.total;
  const countBefore = first.json.leads.find(l => l.user?.id === 1 && l.billboard?.slug === slug).count;

  await api(`/api/billboards/${slug}/contact`, { method: "POST", token: userToken });
  const second = await api("/api/admin/leads?limit=50", { token: adminToken });

  assert.equal(second.json.total, before, "a repeat reveal created a second lead row");
  const countAfter = second.json.leads.find(l => l.user?.id === 1 && l.billboard?.slug === slug).count;
  assert.equal(countAfter, countBefore + 1);
});

test("an admin session browsing a media page does not create a lead", async () => {
  const adminToken = await mintSession({ role: "admin" });
  const before = await api("/api/admin/leads?limit=1", { token: adminToken });
  await api("/api/billboards/valiasr-tower/contact", { method: "POST", token: adminToken });
  const after = await api("/api/admin/leads?limit=1", { token: adminToken });
  assert.equal(after.json.total, before.json.total);
});

test("GET /api/admin/leads is 403 for a customer account", async () => {
  // 403, not 401: the caller is authenticated and simply may not have this.
  // Answering 401 told a client to authenticate again, which could not help —
  // and it disagreed with the route handlers, which have always answered 403
  // for an insufficient role. proxy.ts was the one saying something else.
  const token = await mintSession({ userId: "1", role: "user" });
  const { status } = await api("/api/admin/leads", { token });
  assert.equal(status, 403);
});

test("GET /api/admin/leads is 403 for a viewer", async () => {
  const token = await mintSession({ role: "viewer" });
  const { status } = await api("/api/admin/leads", { token });
  assert.equal(status, 403);
});

test("PATCH /api/admin/leads/[id] moves the follow-up status and keeps a note", async () => {
  const userToken  = await mintSession({ userId: "2", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  await api("/api/billboards/valiasr-tower/contact", { method: "POST", token: userToken });
  const list = await api("/api/admin/leads?limit=50", { token: adminToken });
  const lead = list.json.leads.find(l => l.user?.id === 2 && l.billboard?.slug === "valiasr-tower");
  assert.ok(lead);

  const { status, json } = await api(`/api/admin/leads/${lead.id}`, {
    method: "PATCH", token: adminToken, body: { status: "contacted", note: "تماس گرفته شد" },
  });
  assert.equal(status, 200);
  assert.equal(json.lead.status, "contacted");
  assert.equal(json.lead.note, "تماس گرفته شد");

  const filtered = await api("/api/admin/leads?status=contacted&limit=50", { token: adminToken });
  assert.ok(filtered.json.leads.some(l => l.id === lead.id));
});

test("PATCH /api/admin/leads/[id] rejects a status outside the allowlist", async () => {
  const adminToken = await mintSession({ role: "admin" });
  const list = await api("/api/admin/leads?limit=1", { token: adminToken });
  const id = list.json.leads[0]?.id;
  assert.ok(id, "no lead to patch");
  const { status } = await api(`/api/admin/leads/${id}`, { method: "PATCH", token: adminToken, body: { status: "won" } });
  assert.equal(status, 400);
});

test("PATCH /api/admin/leads/[id] is 404 for an unknown lead", async () => {
  const adminToken = await mintSession({ role: "admin" });
  const { status } = await api("/api/admin/leads/999999", { method: "PATCH", token: adminToken, body: { status: "closed" } });
  assert.equal(status, 404);
});

test("GET /api/stats returns 200", async () => {
  const { status } = await api("/api/stats");
  assert.equal(status, 200);
});

// ── Registration & login ──────────────────────────────────────────────

test("register rejects a short password", async () => {
  const { status } = await api("/api/auth/register", {
    method: "POST",
    body: { name: "Test User", phone: randomPhone(), password: "123", code: "123456" },
  });
  assert.equal(status, 400);
});

test("register rejects a non-Iranian phone number", async () => {
  const { status } = await api("/api/auth/register", {
    method: "POST",
    body: { name: "Test User", phone: "12345", password: "secret123", code: "123456" },
  });
  assert.equal(status, 400);
});

test("register then login: happy path sets a session cookie", async () => {
  const ip = uniqueIp();
  const phone = randomPhone();

  const reg = await registerUser({ name: "New User", phone, ip });
  assert.equal(reg.status, 200, JSON.stringify(reg.json));
  assert.ok(tokenFromSetCookie(reg), "register should set a session cookie");

  const login = await api("/api/auth/login", {
    method: "POST",
    ip,
    body: { phone, password: "secret123" },
  });
  assert.equal(login.status, 200);
  assert.ok(tokenFromSetCookie(login), "login should set a session cookie");
});

test("login with a wrong password and login for a missing user give an identical 401 (no user enumeration)", async () => {
  const ip = uniqueIp();
  const wrongPass = await api("/api/auth/login", {
    method: "POST",
    ip,
    body: { phone: "09120000000", password: "definitely-wrong" },
  });
  const noSuchUser = await api("/api/auth/login", {
    method: "POST",
    ip,
    body: { phone: "09123334444", password: "definitely-wrong" },
  });
  assert.equal(wrongPass.status, 401);
  assert.equal(noSuchUser.status, 401);
  assert.deepEqual(wrongPass.json, noSuchUser.json);
});

test("repeated failures lock the account they are aimed at", async () => {
  // Its own throwaway identifier, not a seeded account: the budget now follows
  // the account, so a test that hammers a shared phone number would spend the
  // budget of every later test that signs in as that user.
  const phone = "09129998001";
  let last;
  for (let i = 0; i < 14; i++) {
    last = await api("/api/auth/login", {
      method: "POST",
      ip: uniqueIp(),            // a new address each time — the account is the limit
      body: { phone, password: "wrong" },
    });
  }
  assert.equal(last.status, 429);
  assert.match(last.json.error, /این حساب/, "the message should say the account is locked, not the network");
});

test("an oversized body is refused on a public route, chunked or not", async () => {
  const big = JSON.stringify({ identifier: "09120000000", password: "x", pad: "a".repeat(64 * 1024) });
  const plain = await api("/api/auth/login", { method: "POST", ip: uniqueIp(), body: big });
  assert.equal(plain.status, 413);

  // A streamed body carries no Content-Length, which is what the old check read.
  const bytes = new TextEncoder().encode(big);
  const stream = new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", body: stream, duplex: "half",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (rasamap-test-suite)", "x-forwarded-for": uniqueIp() },
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(res.status, 413);
});

test("a staff email has one attempt budget across both sign-in forms", async () => {
  const email = `budget-${Date.now()}@example.com`;
  for (let i = 0; i < 5; i++) {
    await api("/api/auth/login", { method: "POST", ip: uniqueIp(), body: { identifier: email, password: "wrong-pass" } });
  }
  const viaAdminForm = await api("/api/admin/auth/login", {
    method: "POST", ip: uniqueIp(),
    body: { email, password: "wrong-pass" },
  });
  assert.equal(viaAdminForm.status, 429, "failures on the shared form must count against the staff form too");
});

/** The device cookie a successful sign-in hands out — see lib/auth/device.ts. */
function deviceCookie(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const m = /^rasamap_device=([^;]+)/.exec(c);
    if (m) return `rasamap_device=${m[1]}`;
  }
  return null;
}

test("strangers locking an account out do not lock out the browser its owner signs in from", async () => {
  const email = "super99002@test.local";
  const first = await api("/api/admin/auth/login", { method: "POST", ip: uniqueIp(), body: { email, password: "secret123" } });
  assert.equal(first.status, 200, JSON.stringify(first.json));
  const device = deviceCookie(first);
  assert.ok(device, "a successful sign-in should hand out a device cookie");

  let stranger;
  for (let i = 0; i < 6; i++) {
    stranger = await api("/api/admin/auth/login", { method: "POST", ip: uniqueIp(), body: { email, password: "wrong-pass" } });
  }
  assert.equal(stranger.status, 429, "the account-wide budget still stops a guesser");

  const owner = await api("/api/admin/auth/login", {
    method: "POST", ip: uniqueIp(), headers: { cookie: device },
    body: { email, password: "secret123" },
  });
  assert.equal(owner.status, 200, "the owner's own browser must still get in");
});

test("signing out revokes that token, and only that one", async () => {
  const phone = randomPhone();
  const registered = await registerUser({ phone, ip: uniqueIp() });
  const here = tokenFromSetCookie(registered);
  const elsewhere = tokenFromSetCookie(await api("/api/auth/login", { method: "POST", ip: uniqueIp(), body: { phone, password: "secret123" } }));

  assert.equal((await api("/api/auth/logout", { method: "POST", token: here })).status, 200);
  assert.equal((await api("/api/auth/me", { token: here })).status, 401, "a copy of a signed-out token must not work");
  assert.equal((await api("/api/auth/me", { token: elsewhere })).status, 200, "another device stays signed in");
});

test("one account's failures do not lock another account on the same address", async () => {
  // This is the whole point of keying on the account. Several people behind one
  // office, campus or carrier address share it, and — as card B1 records — an
  // address is a value the caller can choose anyway, so a control resting on it
  // alone is both unfair and escapable.
  const ip = uniqueIp();
  for (let i = 0; i < 14; i++) {
    await api("/api/auth/login", {
      method: "POST", ip,
      body: { phone: "09129998002", password: "wrong" },
    });
  }
  // A different account from the same address. It does not matter whether the
  // credentials are right — 401 proves the request reached the credential check
  // instead of being turned away at the limiter, which is the whole assertion.
  const other = await api("/api/auth/login", {
    method: "POST", ip,
    body: { phone: "09120000000", password: "whatever" },
  });
  assert.notEqual(other.status, 429, "a neighbour's failures locked this account out");
});

// ── Password reset via phone OTP (SMS layer dormant) ──────────────

test("otp/send for an unknown phone is 200 and reveals nothing", async () => {
  const phone = "09123339999";
  const { status } = await api("/api/auth/otp/send", {
    method: "POST",
    body: { phone, purpose: "password_reset" },
  });
  // The 200 is the point: a different status for an unregistered number would
  // turn this endpoint into a membership oracle. Checking the table proves the
  // silence is real and not merely a withheld field in the response.
  assert.equal(status, 200);
  assert.equal(await countOtpRows(phone), 0, "no code issued for a phone that isn't registered");
});

// Nothing here waits on an SMS. The SMS layer is dormant without
// KAVENEGAR_API_KEY (lib/sms.ts, §16), so sendOtp() returns "sms_disabled"
// without a network call, and the code is read back from the local store
// rather than from a message. The ~1.9 s is bcrypt plus the hash search in
// recoverOtpCode() — both local and both bounded.
test("otp/send + otp/verify resets the password; the new one then logs in", async () => {
  // Its own account: the reset signs out every session, so doing this to a
  // seeded user would invalidate the tokens every later test mints for it.
  const phone = randomPhone();
  const registered = await registerUser({ phone, ip: uniqueIp() });
  assert.equal(registered.status, 200, JSON.stringify(registered.json));
  const oldSession = tokenFromSetCookie(registered);

  const send = await api("/api/auth/otp/send", {
    method: "POST", ip: uniqueIp(),
    body: { phone, purpose: "password_reset" },
  });
  assert.equal(send.status, 200);
  const code = await recoverOtpCode(phone);
  assert.match(String(code ?? ""), /^\d{6}$/, "otp/send should have issued a six-digit code");

  const wrong = await api("/api/auth/otp/verify", {
    method: "POST", ip: uniqueIp(),
    body: { phone, purpose: "password_reset", code: "000000", newPassword: "brandnew1" },
  });
  assert.equal(wrong.status, 400);

  const ok = await api("/api/auth/otp/verify", {
    method: "POST", ip: uniqueIp(),
    body: { phone, purpose: "password_reset", code, newPassword: "brandnew1" },
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));

  assert.equal((await api("/api/auth/me", { token: oldSession })).status, 401,
    "a session from before the reset must stop working — a reset is how a victim takes an account back");

  const login = await api("/api/auth/login", {
    method: "POST", ip: uniqueIp(),
    body: { phone, password: "brandnew1" },
  });
  assert.equal(login.status, 200);
  assert.ok(tokenFromSetCookie(login));
});

test("changing one's own password keeps this session and ends the others", async () => {
  const phone = randomPhone();
  const registered = await registerUser({ phone, ip: uniqueIp() });
  const other = tokenFromSetCookie(registered);
  const login = await api("/api/auth/login", { method: "POST", ip: uniqueIp(), body: { phone, password: "secret123" } });
  const self = tokenFromSetCookie(login);

  const changed = await api("/api/auth/me", {
    method: "PATCH", token: self,
    body: { currentPassword: "secret123", newPassword: "brandnew2" },
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.json));
  const renewed = tokenFromSetCookie(changed);

  assert.equal((await api("/api/auth/me", { token: renewed })).status, 200);
  assert.equal((await api("/api/auth/me", { token: other })).status, 401);
});

test("the sliding refresh stops once a sign-in is a week old", async () => {
  const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
  const token = await mintSession({ userId: "2", role: "user", authTime: eightDaysAgo });
  // mintSession's token expires within the hour, which is inside the refresh window.
  const res = await api("/api/auth/me", { token });
  assert.equal(res.status, 200);
  assert.equal(tokenFromSetCookie(res), null, "an old sign-in must not be renewed");

  const fresh = await api("/api/auth/me", { token: await mintSession({ userId: "2", role: "user" }) });
  assert.ok(tokenFromSetCookie(fresh), "a recent sign-in is still renewed");
});

// ── Sign-up behind a phone code (card B7) ─────────────────────────

test("register without a code is refused and creates nothing", async () => {
  const phone = randomPhone();
  const { status } = await api("/api/auth/register", {
    method: "POST", ip: uniqueIp(),
    body: { name: "No Code", phone, password: "secret123" },
  });
  assert.equal(status, 400);

  // The account must not exist. Asking the sign-in endpoint is the honest
  // check: a 401 here is what a phone with no account answers.
  const login = await api("/api/auth/login", { method: "POST", ip: uniqueIp(), body: { phone, password: "secret123" } });
  assert.equal(login.status, 401, "an account was created without a verified phone");
});

test("register with a wrong code is refused", async () => {
  const phone = randomPhone();
  const send = await api("/api/auth/otp/send", { method: "POST", ip: uniqueIp(), body: { phone, purpose: "register" } });
  assert.equal(send.status, 200);

  const bad = await api("/api/auth/register", {
    method: "POST", ip: uniqueIp(),
    body: { name: "Wrong Code", phone, password: "secret123", code: "000000" },
  });
  assert.equal(bad.status, 400);

  // And the real code still works afterwards — a wrong guess spends an attempt,
  // not the code.
  const ok = await api("/api/auth/register", {
    method: "POST", ip: uniqueIp(),
    body: { name: "Wrong Code", phone, password: "secret123", code: await recoverOtpCode(phone, "register") },
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
});

test("a sign-up code cannot be spent on a password reset", async () => {
  const phone = randomPhone();
  await api("/api/auth/otp/send", { method: "POST", ip: uniqueIp(), body: { phone, purpose: "register" } });
  const code = await recoverOtpCode(phone, "register");

  // Purpose is part of every lookup, so the reset endpoint cannot see this row.
  const cross = await api("/api/auth/otp/verify", {
    method: "POST", ip: uniqueIp(),
    body: { phone, purpose: "password_reset", code, newPassword: "brandnew1" },
  });
  assert.equal(cross.status, 400);
});

test("a register code is consumed once — the same code cannot open a second account", async () => {
  const phone = randomPhone();
  await api("/api/auth/otp/send", { method: "POST", ip: uniqueIp(), body: { phone, purpose: "register" } });
  const code = await recoverOtpCode(phone, "register");

  const first = await api("/api/auth/register", {
    method: "POST", ip: uniqueIp(), body: { name: "First", phone, password: "secret123", code },
  });
  assert.equal(first.status, 200, JSON.stringify(first.json));

  const replay = await api("/api/auth/register", {
    method: "POST", ip: uniqueIp(), body: { name: "Replay", phone, password: "secret123", code },
  });
  // 409 — the duplicate check answers before the spent code does.
  assert.equal(replay.status, 409);
});

test("otp/send for sign-up on a taken number is 409 and issues no code", async () => {
  const phone = "09120000000"; // seeded user 1
  const before = await countOtpRows(phone, "register");
  const { status } = await api("/api/auth/otp/send", {
    method: "POST", ip: uniqueIp(), body: { phone, purpose: "register" },
  });
  // Sign-up does not hide a taken number: the step that creates the account
  // has to refuse it anyway, and silence would leave someone who mistyped a
  // digit waiting for a code that was never coming. The per-phone ceiling is
  // what bounds the abuse.
  assert.equal(status, 409);
  assert.equal(await countOtpRows(phone, "register"), before, "a code was issued for a number that already has an account");
});

test("otp/send is rate limited per phone", async () => {
  const phone = "09120000002"; // seeded user 2
  let last;
  for (let i = 0; i < 5; i++) {
    last = await api("/api/auth/otp/send", { method: "POST", ip: uniqueIp(), body: { phone, purpose: "password_reset" } });
  }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get("Retry-After")) > 0);
});

// ── Listings: submission pipeline ─────────────────────────────────────

test("POST /api/listings without a session is 401", async () => {
  const { status } = await api("/api/listings", {
    method: "POST",
    body: { name: "بیلبورد تست", phone: "09120000000", type: "billboard", city: "تهران", width: 12, height: 4, faces: 2, price: 50 },
  });
  assert.equal(status, 401);
});

test("POST /api/listings creates a row that is NOT publicly visible yet", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status, json } = await api("/api/listings", {
    method: "POST",
    token,
    body: { name: "بیلبورد آزمایشی رایگان", desc: "تست", phone: "09120000000", type: "billboard", city: "تهران", region: "۳", location: "خیابان تست", width: 12, height: 4, faces: 2, price: 50 },
  });
  assert.equal(status, 201, JSON.stringify(json));
  assert.equal(json.listing.moderation, "pending");

  const pub = await api(`/api/billboards?search=${encodeURIComponent("بیلبورد آزمایشی رایگان")}`);
  assert.equal(pub.json.total, 0, "a freshly submitted listing must not appear in search");
});

test("a listing submitted under a Persian name still gets a URL-safe slug", async () => {
  // The public slug route validates `^[a-z0-9-]+$`; a slug carrying Persian
  // characters would publish a row the API then answers 400 for.
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد نام کاملاً فارسی");
  const admin = await api(`/api/admin/billboards/${id}`, { token: adminToken });
  const slug = admin.json.billboard.slug;
  assert.match(slug, /^[a-z0-9-]+$/, `slug is not URL-safe: ${slug}`);

  await decide(adminToken, id, { decision: "approve" });
  assert.equal((await api(`/api/billboards/${slug}`)).status, 200, "an approved listing must be readable by slug");
});

test("POST /api/listings with the featured plan lands in awaiting_payment", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status, json } = await api("/api/listings", {
    method: "POST",
    token,
    body: { name: "بیلبورد ویژه آزمایشی", phone: "09120000000", type: "digital", city: "تهران", width: 8, height: 3, faces: 1, price: 90, plan: "featured" },
  });
  assert.equal(status, 201, JSON.stringify(json));
  assert.equal(json.listing.moderation, "awaiting_payment");
});

test("POST /api/listings accepts a real PNG upload", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status, json } = await api("/api/listings", {
    method: "POST",
    token,
    body: { name: "بیلبورد با عکس", phone: "09120000000", type: "billboard", city: "شیراز", width: 10, height: 3, faces: 1, price: 40, images: [pngDataUrl()] },
  });
  assert.equal(status, 201, JSON.stringify(json));
});

test("a photo uploaded while the server is running is served, and nothing outside uploads is", async () => {
  // next start lists public/ once at boot; this photo is written long after.
  const token = await mintSession({ userId: "2", role: "user" });
  const sent = await api("/api/listings", {
    method: "POST", token,
    body: { name: "بیلبورد عکس تازه", phone: "09120000000", type: "billboard", city: "شیراز", width: 10, height: 3, faces: 1, price: 40, images: [pngDataUrl()] },
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.json));
  const mine = await api("/api/listings", { token });
  const url = mine.json.listings.find(l => l.id === sent.json.listing.id).images[0];

  const photo = await fetch(BASE + url, { headers: { "user-agent": "Mozilla/5.0 (rasamap-test-suite)" } });
  assert.equal(photo.status, 200, `${url} was not served`);
  assert.equal(photo.headers.get("content-type"), "image/png");

  for (const probe of ["/uploads/..%2F..%2Fpackage.json", "/uploads/listings/%2E%2E/%2E%2E/%2E%2E/.env"]) {
    const res = await fetch(BASE + probe, { headers: { "user-agent": "Mozilla/5.0 (rasamap-test-suite)" } });
    assert.equal(res.status, 404, `${probe} escaped the uploads folder`);
  }
});

test("POST /api/listings rejects a non-image disguised as a PNG (magic-byte check)", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status, json } = await api("/api/listings", {
    method: "POST",
    token,
    body: { name: "بیلبورد بدافزار", phone: "09120000000", type: "billboard", city: "تهران", width: 10, height: 3, faces: 1, price: 40, images: [fakeImageDataUrl()] },
  });
  assert.equal(status, 400, JSON.stringify(json));
  assert.match(json.error, /تصویر/);
});

test("POST /api/listings rejects more than five images", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status } = await api("/api/listings", {
    method: "POST",
    token,
    body: { name: "بیلبورد پرعکس", phone: "09120000000", type: "billboard", city: "تهران", width: 10, height: 3, faces: 1, price: 40, images: Array.from({ length: 6 }, pngDataUrl) },
  });
  assert.equal(status, 400);
});

test("10 identical listing submissions fired together create exactly one row (race guard)", async () => {
  // The non-idempotent write now lives on this path, so the concurrency guard
  // does too. Idempotency-Key is opt-in; these requests deliberately send none,
  // so the only thing standing between a double-click and a duplicate row is
  // the partial unique index on (submittedById, name, city).
  const token = await mintSession({ userId: "2", role: "user" });
  const payload = {
    name: "بیلبورد مسابقه همزمانی", phone: "09120000000", type: "billboard",
    city: "تهران", region: "۱", location: "خیابان تست", width: 12, height: 4, faces: 2, price: 55,
  };

  const results = await Promise.all(
    Array.from({ length: 10 }, () => api("/api/listings", { method: "POST", token, body: payload })),
  );

  const created  = results.filter((r) => r.status === 201).length;
  const rejected = results.filter((r) => r.status === 409).length;
  const other    = results.filter((r) => r.status !== 201 && r.status !== 409);

  assert.equal(created, 1, `expected exactly one 201, got ${results.map((r) => r.status).join(",")}`);
  assert.equal(other.length, 0, `unexpected statuses: ${other.map((r) => r.status).join(",")}`);
  assert.equal(rejected, 9);
});

test("a duplicate listing submitted later is refused with a clear 409", async () => {
  const token = await mintSession({ userId: "2", role: "user" });
  const payload = {
    name: "بیلبورد تکراری دیرهنگام", phone: "09120000000", type: "billboard",
    city: "اصفهان", width: 10, height: 3, faces: 1, price: 40,
  };
  assert.equal((await api("/api/listings", { method: "POST", token, body: payload })).status, 201);

  const again = await api("/api/listings", { method: "POST", token, body: payload });
  assert.equal(again.status, 409);
  assert.match(again.json.error, /قبلاً ثبت/);
});

test("a different user may submit a media with the same name (the constraint is per submitter)", async () => {
  const other = await mintSession({ userId: "1", role: "user" });
  const { status } = await api("/api/listings", {
    method: "POST", token: other,
    body: { name: "بیلبورد تکراری دیرهنگام", phone: "09120000000", type: "billboard", city: "اصفهان", width: 10, height: 3, faces: 1, price: 40 },
  });
  assert.equal(status, 201);
});

test("listings: a repeated Idempotency-Key replays the first response (no second row)", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const key = "idem-" + Math.random().toString(36).slice(2);
  const payload = { name: "بیلبورد تکراری", phone: "09120000000", type: "billboard", city: "تهران", width: 12, height: 4, faces: 2, price: 60 };

  const first = await api("/api/listings", { method: "POST", token, body: payload, headers: { "idempotency-key": key } });
  assert.equal(first.status, 201, JSON.stringify(first.json));

  const replay = await api("/api/listings", { method: "POST", token, body: payload, headers: { "idempotency-key": key } });
  assert.equal(replay.status, 201);
  assert.equal(replay.json.listing.id, first.json.listing.id, "the same row must come back, not a new one");
});

test("listings: concurrent requests with one Idempotency-Key run the work once", async () => {
  // Different names, so the partial unique index cannot be what stops them —
  // only the key can. A lookup-then-save let several of these all run.
  const token = await mintSession({ userId: "2", role: "user" });
  const key = `race-${Date.now()}`;
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => api("/api/listings", {
    method: "POST", token, headers: { "idempotency-key": key },
    body: { name: `بیلبورد کلید همزمان ${i}`, phone: "09120000000", type: "billboard", city: "تهران", width: 12, height: 4, faces: 2, price: 55 },
  })));
  const ids = new Set(results.filter(r => r.status === 201).map(r => r.json.listing.id));
  assert.equal(ids.size, 1, `the key let ${ids.size} submissions through: ${results.map(r => r.status).join(",")}`);
  assert.ok(results.every(r => r.status === 201 || r.status === 409), results.map(r => r.status).join(","));

  const mine = await api("/api/listings", { token });
  const made = mine.json.listings.filter(l => l.name.startsWith("بیلبورد کلید همزمان"));
  assert.equal(made.length, 1);
});

test("listings: a refused submission leaves its Idempotency-Key free for the retry", async () => {
  const token = await mintSession({ userId: "2", role: "user" });
  const key = `retry-${Date.now()}`;
  const body = { name: "بیلبورد تلاش دوباره", phone: "09120000000", type: "billboard", city: "تهران", width: 12, height: 4, faces: 2, price: 55 };
  const bad = await api("/api/listings", { method: "POST", token, headers: { "idempotency-key": key }, body: { ...body, images: [fakeImageDataUrl()] } });
  assert.equal(bad.status, 400);
  const good = await api("/api/listings", { method: "POST", token, headers: { "idempotency-key": key }, body });
  assert.equal(good.status, 201, JSON.stringify(good.json));
});

test("listings: an Idempotency-Key reused by a different user is rejected with 409", async () => {
  const tokenA = await mintSession({ userId: "1", role: "user" });
  const tokenB = await mintSession({ userId: "2", role: "user" });
  const key = "idem-cross-" + Math.random().toString(36).slice(2);
  const payload = { name: "بیلبورد مشترک", phone: "09120000000", type: "billboard", city: "تهران", width: 12, height: 4, faces: 2, price: 60 };

  const a = await api("/api/listings", { method: "POST", token: tokenA, body: payload, headers: { "idempotency-key": key } });
  assert.equal(a.status, 201);
  const b = await api("/api/listings", { method: "POST", token: tokenB, body: payload, headers: { "idempotency-key": key } });
  assert.equal(b.status, 409);
});

// ── Object-level authorisation ───────────────────────────────────────

test("a user cannot see another user's listings via GET /api/listings", async () => {
  const tokenA = await mintSession({ userId: "1", role: "user" });
  const tokenB = await mintSession({ userId: "2", role: "user" });

  const created = await api("/api/listings", {
    method: "POST",
    token: tokenA,
    body: { name: "بیلبورد خصوصی کاربر یک", phone: "09120000000", type: "billboard", city: "تهران", width: 12, height: 4, faces: 2, price: 70 },
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const id = created.json.listing.id;

  const listA = await api("/api/listings", { token: tokenA });
  const listB = await api("/api/listings", { token: tokenB });
  assert.equal(listA.status, 200);
  assert.equal(listB.status, 200);

  assert.ok(listA.json.listings.some((l) => l.id === id), "the submitter should see their own listing");
  assert.ok(listB.json.listings.every((l) => l.id !== id), "a different user must not see it");
});

// ── Admin route: auth ordering & RBAC ────────────────────────────────

test("GET /api/admin/billboards without a session is 401", async () => {
  const { status } = await api("/api/admin/billboards");
  assert.equal(status, 401);
});

test("GET /api/admin/billboards with role 'user' is 403", async () => {
  const token = await mintSession({ role: "user" });
  const { status } = await api("/api/admin/billboards", { token });
  assert.equal(status, 403);
});

test("GET /api/admin/billboards with role 'admin' is 200", async () => {
  const token = await mintSession({ role: "admin" });
  const { status, json } = await api("/api/admin/billboards", { token });
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.items));
});

test("POST /api/admin/billboards with role 'viewer' is 403 (insufficient permission)", async () => {
  const token = await mintSession({ role: "viewer" });
  const { status } = await api("/api/admin/billboards", {
    method: "POST",
    token,
    body: { name: "Should Fail", location: "nowhere road", city: "تهران", type: "billboard", price: 1 },
  });
  assert.equal(status, 403);
});

test("an admin billboard create is written to the durable audit log", async () => {
  const token = await mintSession({ role: "admin" });

  const created = await api("/api/admin/billboards", {
    method: "POST",
    token,
    body: { name: "Audit Fixture Board", location: "audit test road", city: "تهران", type: "billboard", price: 100 },
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));

  const audit = await api("/api/admin/audit", { token });
  assert.equal(audit.status, 200);
  assert.ok(Array.isArray(audit.json.persisted), "response should carry a persisted[] array");
  assert.ok(
    audit.json.persisted.some((row) => row.action === "billboard_create"),
    "a billboard_create row should be persisted",
  );
});

// ── Admin — user management ────────────────────────────────────────

test("GET /api/admin/users with role 'admin' is 403 (super_admin only)", async () => {
  const token = await mintSession({ role: "admin" });
  const { status } = await api("/api/admin/users", { token });
  assert.equal(status, 403);
});

test("super_admin can create an admin, change its role, and both are audited", async () => {
  const token = await mintSession({ role: "super_admin", userId: "99001" });
  const email = `mgr_${Date.now()}@example.com`;

  const created = await api("/api/admin/users", {
    method: "POST",
    token,
    body: { email, name: "Manager Fixture", role: "viewer", password: "secret123" },
  });
  assert.equal(created.status, 200, JSON.stringify(created.json));
  const id = created.json.admin.id;
  assert.equal(created.json.admin.role, "viewer");

  const patched = await api(`/api/admin/users/${id}`, {
    method: "PATCH",
    token,
    body: { role: "editor" },
  });
  assert.equal(patched.status, 200, JSON.stringify(patched.json));
  assert.equal(patched.json.admin.role, "editor");

  const audit = await api("/api/admin/audit", { token });
  assert.ok(audit.json.persisted.some((r) => r.action === "admin_user_create"));
  assert.ok(audit.json.persisted.some((r) => r.action === "admin_user_update"));
});

// ── Admin — a session is only as good as the account behind it ─────

test("a staff member can change their own password, which ends their other sessions", async () => {
  const superToken = await mintSession({ role: "super_admin", userId: "99003" });
  const email = `pwchange_${Date.now()}@example.com`;
  const created = await api("/api/admin/users", {
    method: "POST", token: superToken,
    body: { email, name: "Password Changer", role: "viewer", password: "first-pass-1" },
  });
  assert.equal(created.status, 200, JSON.stringify(created.json));

  const signIn = (password) => api("/api/admin/auth/login", { method: "POST", ip: uniqueIp(), body: { email, password } });
  const other = tokenFromSetCookie(await signIn("first-pass-1"));
  const self  = tokenFromSetCookie(await signIn("first-pass-1"));

  const wrong = await api("/api/admin/auth/me", { method: "PATCH", token: self, body: { currentPassword: "nope", newPassword: "second-pass-2" } });
  assert.equal(wrong.status, 400);

  const changed = await api("/api/admin/auth/me", { method: "PATCH", token: self, body: { currentPassword: "first-pass-1", newPassword: "second-pass-2" } });
  assert.equal(changed.status, 200, JSON.stringify(changed.json));
  const renewed = tokenFromSetCookie(changed);

  assert.equal((await api("/api/admin/auth/me", { token: renewed })).status, 200, "this device stays in");
  assert.equal((await api("/api/admin/auth/me", { token: other })).status, 401, "every other session ends");
  assert.equal((await signIn("second-pass-2")).status, 200);
});

test("a valid token for a deactivated admin is refused", async () => {
  // The signature is genuine and the token has not expired. What changed is the
  // account: `active` is false. Before getStaffSession nothing read the row
  // again, so a revoked administrator kept working until the token ran out.
  const token = await mintSession({ role: "admin", userId: "9005" });

  assert.equal((await api("/api/admin/billboards", { token })).status, 401);
  assert.equal((await api("/api/admin/auth/me", { token })).status, 401);
  // /api/auth/me is where the sliding refresh lives, so it must refuse too —
  // otherwise a revoked session could renew itself indefinitely.
  assert.equal((await api("/api/auth/me", { token })).status, 401);
});

test("a token is judged by the role the account holds, not the one it claims", async () => {
  const superToken = await mintSession({ role: "super_admin", userId: "99001" });
  const email = `demoted_${Date.now()}@example.com`;

  const created = await api("/api/admin/users", {
    method: "POST",
    token: superToken,
    body: { email, name: "Demotion Fixture", role: "viewer", password: "secret123" },
  });
  assert.equal(created.status, 200, JSON.stringify(created.json));
  const id = String(created.json.admin.id);

  // A token claiming super_admin for an account that is only a viewer.
  const inflated = await mintSession({ role: "super_admin", userId: id });

  // Refused where the claim would have granted something...
  assert.equal((await api("/api/admin/users", { token: inflated })).status, 403);
  // ...and still allowed everything a viewer may really do. A stale role is
  // corrected, not a reason to throw someone out of the panel.
  assert.equal((await api("/api/admin/billboards", { token: inflated })).status, 200);
});

test("a duplicate admin email is rejected with 409", async () => {
  const token = await mintSession({ role: "super_admin", userId: "99002" });
  const email = `dup_${Date.now()}@example.com`;
  const body = { email, name: "Dup", role: "viewer", password: "secret123" };
  const first = await api("/api/admin/users", { method: "POST", token, body });
  assert.equal(first.status, 200);
  const second = await api("/api/admin/users", { method: "POST", token, body });
  assert.equal(second.status, 409);
});

test("a super_admin cannot change the role of its own account (409)", async () => {
  const token = await mintSession({ role: "super_admin", userId: "99003" });
  // Created as a super_admin, because that is the account this test is about.
  // It used to be created as an "admin" and then given a token claiming
  // super_admin — which only reached the self-edit check while nothing verified
  // the claim. The role is now read from the row, so the fixture has to hold
  // the role it is meant to be exercising.
  const created = await api("/api/admin/users", {
    method: "POST",
    token,
    body: { email: `self_${Date.now()}@example.com`, name: "Self", role: "super_admin", password: "secret123" },
  });
  const id = created.json.admin.id;

  const selfToken = await mintSession({ role: "super_admin", userId: String(id) });
  const { status } = await api(`/api/admin/users/${id}`, {
    method: "PATCH",
    token: selfToken,
    body: { role: "viewer" },
  });
  assert.equal(status, 409);
});

// ── Admin — registered-users directory ────────────────────────────

test("GET /api/admin/customers without a session is 401", async () => {
  const { status } = await api("/api/admin/customers");
  assert.equal(status, 401);
});

test("GET /api/admin/customers with role 'viewer' is 403", async () => {
  const token = await mintSession({ role: "viewer" });
  const { status } = await api("/api/admin/customers", { token });
  assert.equal(status, 403);
});

test("GET /api/admin/customers returns a paginated directory for an admin", async () => {
  const token = await mintSession({ role: "admin" });
  const { status, json } = await api("/api/admin/customers?limit=5", { token });
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.users));
  assert.equal(typeof json.total, "number");
  assert.equal(typeof json.pages, "number");
  if (json.users.length) {
    const u = json.users[0];
    assert.ok("phone" in u && "listingCount" in u);
    assert.ok(!("passwordHash" in u), "must never expose the password hash");
  }
});

test("GET /api/admin/customers/[id] returns the user with their listings; hash never leaks", async () => {
  const token = await mintSession({ role: "admin" });
  const { status, json } = await api("/api/admin/customers/1", { token });
  assert.equal(status, 200);
  assert.equal(json.user.id, 1);
  assert.ok(Array.isArray(json.user.listings));
  assert.ok(!("passwordHash" in json.user));
});

test("GET /api/admin/customers/[id] is 404 for an unknown user", async () => {
  const token = await mintSession({ role: "admin" });
  const { status } = await api("/api/admin/customers/999999", { token });
  assert.equal(status, 404);
});

test("PATCH /api/admin/customers/[id] edits the name and audits it", async () => {
  const token = await mintSession({ role: "admin" });
  const patched = await api("/api/admin/customers/2", {
    method: "PATCH", token, body: { name: "Sara Renamed" },
  });
  assert.equal(patched.status, 200, JSON.stringify(patched.json));
  assert.equal(patched.json.user.name, "Sara Renamed");

  const audit = await api("/api/admin/audit", { token });
  assert.ok(audit.json.persisted.some((r) => r.action === "customer_update"));
});

test("POST /api/admin/customers/[id]/reset-password returns a fresh password and ends old sessions", async () => {
  const phone = randomPhone();
  const registered = await registerUser({ phone, ip: uniqueIp() });
  const oldSession = tokenFromSetCookie(registered);
  const id = registered.json.user.id;

  const token = await mintSession({ role: "super_admin" });
  const res = await api(`/api/admin/customers/${id}/reset-password`, { method: "POST", token });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(typeof res.json.password, "string");
  assert.ok(res.json.password.length >= 8);
  assert.equal((await api("/api/auth/me", { token: oldSession })).status, 401);

  const audit = await api("/api/admin/audit", { token });
  assert.ok(audit.json.persisted.some((r) => r.action === "customer_password_reset"));
});

test("an admin below super_admin cannot take over a customer account", async () => {
  // Setting a password it then reads back, or moving the number to one it
  // controls and resetting through it, both hand the account to the admin.
  const token = await mintSession({ role: "admin" });
  const reset = await api("/api/admin/customers/2/reset-password", { method: "POST", token });
  const phone = await api("/api/admin/customers/2", { method: "PATCH", token, body: { phone: randomPhone() } });
  assert.equal(reset.status, 403);
  assert.equal(phone.status, 403);
});

test("customer routes are 403 for role 'viewer'", async () => {
  const token = await mintSession({ role: "viewer" });
  const a = await api("/api/admin/customers/1", { token });
  const b = await api("/api/admin/customers/1", { method: "PATCH", token, body: { name: "x" } });
  const c = await api("/api/admin/customers/1/reset-password", { method: "POST", token });
  assert.equal(a.status, 403);
  assert.equal(b.status, 403);
  assert.equal(c.status, 403);
});

// ── Rate limiting ────────────────────────────────────────────────

// Rate limiting now lives where it belongs — on the endpoints that write or
// authenticate, not on reading pages. Registration is one of the tight ones and
// is meant to stay tight: five per hour from one address.
test("a refused request returns 429 with a Retry-After header", async () => {
  // Registration used to be the vehicle for this, at five an hour. It is now a
  // wide window with no lockout on purpose (the sixth person to sign up from an
  // office was being refused for the rest of the hour), so the tight limit that
  // remains — and the one worth checking the shape of — is the per-account
  // sign-in budget.
  const phone = "09129999123";   // never registered; only the budget matters
  let got429 = null;
  for (let i = 0; i < 14 && !got429; i++) {
    const res = await api("/api/auth/login", {
      method: "POST",
      ip: uniqueIp(),          // a fresh address each time: this is the account limit
      body: { phone, password: "definitely-wrong" },
    });
    if (res.status === 429) got429 = res;
  }
  assert.ok(got429, "expected a 429 within 14 failed sign-ins against one account");
  assert.ok(Number(got429.headers.get("Retry-After")) > 0);
});

test("reading is not rate limited the way writing is", async () => {
  // The catalogue used to refuse a visitor who reloaded too often, which no
  // ordinary site does and which a shared address made easy to hit. 120 reads
  // from one address in a row must all succeed.
  const ip = uniqueIp();
  for (let i = 0; i < 120; i++) {
    const res = await api("/api/billboards?limit=12", { ip });
    assert.equal(res.status, 200, `read ${i + 1} was refused with ${res.status}`);
  }
});

// ── Reviews ─────────────────────────────────────────────────────────

test("GET /api/reviews returns reviews for a billboard", async () => {
  const { status, json } = await api("/api/reviews?billboardId=3");
  assert.equal(status, 200);
  const arr = Array.isArray(json) ? json : json.reviews;
  assert.ok(Array.isArray(arr));
});

test("POST /api/reviews without a session is 401", async () => {
  const { status } = await api("/api/reviews", {
    method: "POST",
    body: { billboardId: 3, rating: 5, comment: "خوب بود" },
  });
  assert.equal(status, 401);
});

test("POST /api/reviews is 404 for a listing that is not published", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status } = await api("/api/reviews", {
    method: "POST",
    token,
    body: { billboardId: 4, rating: 4, comment: "این آگهی هنوز تأیید نشده" },
  });
  assert.equal(status, 404);
});

test("POST /api/reviews succeeds for a signed-in user and updates the billboard aggregate", async () => {
  const token1 = await mintSession({ userId: "1", role: "user" });
  const token2 = await mintSession({ userId: "2", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const a = await api("/api/reviews", { method: "POST", token: token1, body: { billboardId: 6, rating: 5, comment: "موقعیت عالی و پرتردد بود" } });
  assert.equal(a.status, 201, JSON.stringify(a.json));
  const b = await api("/api/reviews", { method: "POST", token: token2, body: { billboardId: 6, rating: 3, comment: "متوسط بود، قیمت بالاست" } });
  assert.equal(b.status, 201, JSON.stringify(b.json));

  // billboards.rating / reviewCount are denormalised from the reviews table;
  // they must reflect the two rows just written, not a seeded placeholder.
  const bb = await api("/api/admin/billboards/6", { token: adminToken });
  assert.equal(bb.json.billboard.reviewCount, 2);
  assert.equal(bb.json.billboard.rating, 4);
});

test("a second review by the same user replaces the first (one per account)", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const again = await api("/api/reviews", { method: "POST", token, body: { billboardId: 6, rating: 1, comment: "نظرم عوض شد متأسفانه" } });
  assert.equal(again.status, 201, JSON.stringify(again.json));

  const bb = await api("/api/admin/billboards/6", { token: adminToken });
  assert.equal(bb.json.billboard.reviewCount, 2, "an edit must not add a row");
  assert.equal(bb.json.billboard.rating, 2, "the average must be recomputed, not incremented");
});

// ── Analytics ───────────────────────────────────────────────────────

test("GET /api/analytics returns a shape with topCities", async () => {
  const { status, json } = await api("/api/analytics");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.topCities));
});

test("GET /api/analytics?city=... is 200", async () => {
  const { status } = await api("/api/analytics?city=" + encodeURIComponent("تهران"));
  assert.equal(status, 200);
});

test("analytics image coverage counts only rows that actually have an image", async () => {
  // The fixture set has exactly one published billboard with an image. A Json
  // `not: "[]"` filter used to match every row and report 100% coverage.
  const { json } = await api("/api/analytics");
  assert.equal(json.coverage.withImage, 1, `expected 1, got ${json.coverage.withImage} of ${json.total}`);
  assert.ok(json.coverage.withImage < json.total);
});

// ── Admin billboard mutations ───────────────────────────────────────

test("PUT /api/admin/billboards/[id] with role 'viewer' is 403", async () => {
  const token = await mintSession({ role: "viewer" });
  const { status } = await api("/api/admin/billboards/2", {
    method: "PUT",
    token,
    body: { price: 99999 },
  });
  assert.equal(status, 403);
});

test("PUT /api/admin/billboards/[id] with role 'admin' updates the row", async () => {
  const token = await mintSession({ role: "admin" });
  const { status, json } = await api("/api/admin/billboards/2", {
    method: "PUT",
    token,
    body: { price: 13500 },
  });
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.billboard?.price, 13500);
});

test("the photo list keeps only photos the record already has", async () => {
  const editor = await mintSession({ role: "editor" });
  // id 6 (photo-board) carries /uploads/test/1.jpg in the fixtures.
  const keep = await api("/api/admin/billboards/6/images", { method: "PUT", token: editor, body: { images: ["/uploads/test/1.jpg"] } });
  assert.equal(keep.status, 200, JSON.stringify(keep.json));
  assert.deepEqual(keep.json.images, ["/uploads/test/1.jpg"]);

  for (const foreign of ["https://tracker.example/pixel.png", "/uploads/other/9.jpg"]) {
    const res = await api("/api/admin/billboards/6/images", { method: "PUT", token: editor, body: { images: [foreign] } });
    assert.equal(res.status, 400, `${foreign} was stored as if it were this record's photo`);
  }
});

test("a bad photo in an admin batch writes none of it, and a good batch is audited", async () => {
  const editor = await mintSession({ role: "editor" });
  const dir = join(process.cwd(), "public", "uploads", "billboards");
  const folders = () => { try { return readdirSync(dir).length; } catch { return 0; } };

  const before = folders();
  const bad = await api("/api/admin/billboards/6/images", {
    method: "PUT", token: editor,
    body: { images: ["/uploads/test/1.jpg", pngDataUrl(), fakeImageDataUrl()] },
  });
  assert.equal(bad.status, 400);
  assert.equal(folders(), before, "the valid photo ahead of the bad one must not be left on disk");

  const good = await api("/api/admin/billboards/6/images", {
    method: "PUT", token: editor,
    body: { images: [pngDataUrl(), "/uploads/test/1.jpg"] },
  });
  assert.equal(good.status, 200, JSON.stringify(good.json));
  assert.equal(good.json.images[1], "/uploads/test/1.jpg", "order is kept");
  assert.match(good.json.images[0], /^\/uploads\/billboards\/[0-9a-f-]+\/1\.png$/);

  const audit = await api("/api/admin/audit", { token: await mintSession({ role: "admin" }) });
  assert.ok(audit.json.persisted.some(r => r.action === "billboard_images_update"));
});

test("photos a resubmission drops, and those of a deleted listing, leave the disk", async () => {
  const owner = await mintSession({ userId: "2", role: "user" });
  const adminToken = await mintSession({ role: "admin" });
  const onDisk = (url) => { try { readFileSync(join(process.cwd(), "public", url)); return true; } catch { return false; } };
  const base = { phone: "09120000000", type: "billboard", city: "کرج", region: "۱", location: "خیابان تست", width: 8, height: 3, faces: 1, price: 30, plan: "free" };

  const sent = await api("/api/listings", { method: "POST", token: owner, body: { ...base, name: "بیلبورد پاک‌سازی عکس", images: [pngDataUrl(), pngDataUrl()] } });
  assert.equal(sent.status, 201, JSON.stringify(sent.json));
  const id = sent.json.listing.id;
  const own = async () => (await api("/api/listings", { token: owner })).json.listings.find(l => l.id === id);
  const [keep, drop] = (await own()).images;
  assert.ok(onDisk(keep) && onDisk(drop));

  await decide(adminToken, id, { decision: "revision", note: "یک عکس کافی است." });
  const resent = await api(`/api/listings/${id}`, { method: "PATCH", token: owner, body: { ...base, name: "بیلبورد پاک‌سازی عکس", images: [keep] } });
  assert.equal(resent.status, 200, JSON.stringify(resent.json));
  assert.ok(onDisk(keep), "a kept photo must stay");
  assert.ok(!onDisk(drop), "a dropped photo must be removed");

  assert.equal((await api(`/api/admin/billboards/${id}`, { method: "DELETE", token: adminToken })).status, 200);
  assert.ok(!onDisk(keep), "a deleted listing's photos must be removed");
});

test("DELETE /api/admin/billboards/[id] with role 'editor' is 403 (needs admin+)", async () => {
  const token = await mintSession({ role: "editor" });
  const { status } = await api("/api/admin/billboards/2", { method: "DELETE", token });
  assert.equal(status, 403);
});

// ── Admin listing approval + audit ──────────────────────────────────

async function submitListing(token, name, plan = "free") {
  const res = await api("/api/listings", {
    method: "POST",
    token,
    body: { name, phone: "09120000000", type: "billboard", city: "تهران", region: "۱", location: "خیابان تست", width: 12, height: 4, faces: 2, price: 55, plan },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json.listing.id;
}

/** The version of a queued listing the admin is looking at — see decideListing. */
async function seenVersion(adminToken, id) {
  const queue = await api("/api/admin/listings?limit=50", { token: adminToken });
  const row = queue.json.listings.find(l => l.id === id);
  assert.ok(row, `listing ${id} is not in the approval queue`);
  return row.updatedAt;
}

/** A decision on the version currently in the queue, unless `seen` says otherwise. */
async function decide(adminToken, id, body) {
  const seen = body.seen ?? await seenVersion(adminToken, id);
  return api(`/api/admin/listings/${id}/decision`, { method: "POST", token: adminToken, body: { ...body, seen } });
}

test("approving a free listing publishes it and writes a durable audit row", async () => {
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد در انتظار تأیید");

  const decision = await decide(adminToken, id, { decision: "approve" });
  assert.equal(decision.status, 200, JSON.stringify(decision.json));
  assert.equal(decision.json.listing.moderation, "approved");
  assert.equal(decision.json.listing.featured, false, "a free plan must not be promoted");

  const audit = await api("/api/admin/audit", { token: adminToken });
  assert.ok(
    audit.json.persisted.some((r) => r.action === "listing_approved"),
    "a listing_approved row should be persisted",
  );
});

test("approving a featured listing grants the promotion; a free one never does", async () => {
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد ویژه در انتظار پرداخت", "featured");

  const decision = await decide(adminToken, id, { decision: "approve" });
  assert.equal(decision.status, 200, JSON.stringify(decision.json));
  assert.equal(decision.json.listing.moderation, "approved");
  assert.equal(decision.json.listing.featured, true, "confirming payment should grant the featured slot");
});

test("the account that listed a media item cannot rate it", async () => {
  const owner      = await mintSession({ userId: "1", role: "user" });
  const other      = await mintSession({ userId: "2", role: "user" });
  const adminToken = await mintSession({ role: "admin" });
  const id = await submitListing(owner, "بیلبورد بدون امتیاز مالک");
  assert.equal((await decide(adminToken, id, { decision: "approve" })).status, 200);

  const body = { billboardId: id, rating: 5, comment: "بهترین رسانه‌ای که دیده‌ام، واقعاً." };
  assert.equal((await api("/api/reviews", { method: "POST", token: owner, body })).status, 403);
  assert.equal((await api("/api/reviews", { method: "POST", token: other, body })).status, 201);
});

test("a decided listing cannot be decided again (409)", async () => {
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد یک‌بار تصمیم");
  const seen = await seenVersion(adminToken, id);
  assert.equal((await decide(adminToken, id, { decision: "approve", seen })).status, 200);

  const again = await decide(adminToken, id, { decision: "approve", seen });
  assert.equal(again.status, 409);
});

test("a rejected listing is unreachable, not merely absent from search", async () => {
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const name = "بیلبورد رد شده آزمایشی";
  const id = await submitListing(userToken, name);
  const decision = await decide(adminToken, id, { decision: "reject", note: "تصاویر با مکان اعلام‌شده هم‌خوانی ندارد." });
  assert.equal(decision.status, 200);
  // A rejection is a review state, not an availability: an idle board
  // ("inactive") is public, and a turned-down submission must not be.
  assert.equal(decision.json.listing.moderation, "rejected");

  const pub = await api(`/api/billboards?search=${encodeURIComponent(name)}`);
  assert.equal(pub.json.total, 0, "must not appear in search");

  // And the row itself must 404 by slug, the way a pending one does.
  const admin = await api(`/api/admin/billboards/${id}`, { token: adminToken });
  const slug = admin.json.billboard.slug;
  assert.equal((await api(`/api/billboards/${slug}`)).status, 404, "must not be readable by URL");
});

test("rejecting or sending a listing back for revision requires a note for the submitter", async () => {
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد بدون توضیح آزمایشی");

  for (const decision of ["reject", "revision"]) {
    const res = await decide(adminToken, id, { decision });
    assert.equal(res.status, 400, `${decision} without a note must be refused`);
  }
});

test("a revision request parks the listing in needs_revision and the submitter can edit and resend it", async () => {
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد نیازمند اصلاح آزمایشی");

  const sent = await decide(adminToken, id, { decision: "revision", note: "لطفاً ابعاد دقیق سازه را اصلاح کنید." });
  assert.equal(sent.status, 200, JSON.stringify(sent.json));
  assert.equal(sent.json.listing.moderation, "needs_revision");

  // Not publicly reachable while it waits on the submitter.
  const admin = await api(`/api/admin/billboards/${id}`, { token: adminToken });
  const slug = admin.json.billboard.slug;
  assert.equal((await api(`/api/billboards/${slug}`)).status, 404, "must not be readable by URL");

  // The submitter sees the admin's note and the needs_revision state on their
  // own dashboard feed.
  const mine = await api("/api/listings", { token: userToken });
  const row = mine.json.listings.find(l => l.id === id);
  assert.equal(row.moderation, "needs_revision");
  assert.equal(row.reviewNote, "لطفاً ابعاد دقیق سازه را اصلاح کنید.");

  // The submitter fixes it and resends — the row re-enters the queue as pending
  // and the review note is cleared.
  const resubmit = await api(`/api/listings/${id}`, {
    method: "PATCH", token: userToken,
    body: { name: "بیلبورد نیازمند اصلاح آزمایشی", phone: "09120000000", type: "billboard", city: "تهران", region: "۱", location: "خیابان تست اصلاح‌شده", width: 10, height: 5, faces: 2, price: 60, plan: "free", images: [] },
  });
  assert.equal(resubmit.status, 200, JSON.stringify(resubmit.json));
  assert.equal(resubmit.json.listing.moderation, "pending");
  assert.equal(resubmit.json.listing.reviewNote, null);

  const back = await api(`/api/admin/billboards/${id}`, { token: adminToken });
  assert.equal(back.json.billboard.moderation, "pending");
  assert.equal(back.json.billboard.location, "خیابان تست اصلاح‌شده");

  // A second resubmit is refused — the row is no longer in needs_revision.
  const again = await api(`/api/listings/${id}`, {
    method: "PATCH", token: userToken,
    body: { name: "بیلبورد نیازمند اصلاح آزمایشی", phone: "09120000000", type: "billboard", city: "تهران", region: "۱", location: "خیابان تست", width: 10, height: 5, faces: 2, price: 60, plan: "free", images: [] },
  });
  assert.equal(again.status, 409);
});

test("an approval applies only to the version the admin reviewed", async () => {
  // The admin opens a listing sent back for revision; before they click, the
  // submitter resends it with new content. Approving must not publish what
  // nobody looked at.
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });
  const name = "بیلبورد نسخه بررسی‌شده";
  const id = await submitListing(userToken, name);
  await decide(adminToken, id, { decision: "revision", note: "عکس اضافه کنید." });

  const seen = await seenVersion(adminToken, id);
  const resent = await api(`/api/listings/${id}`, {
    method: "PATCH", token: userToken,
    body: { name, phone: "09120000000", type: "billboard", city: "تهران", region: "۱", location: "محتوای تازه", width: 12, height: 4, faces: 2, price: 55, plan: "free", images: [] },
  });
  assert.equal(resent.status, 200, JSON.stringify(resent.json));

  const stale = await decide(adminToken, id, { decision: "approve", seen });
  assert.equal(stale.status, 409, "a decision on an older version must be refused");

  const fresh = await decide(adminToken, id, { decision: "approve" });
  assert.equal(fresh.status, 200, "a decision on the current version goes through");
});

test("only the account that submitted a listing may resubmit it", async () => {
  const owner    = await mintSession({ userId: "1", role: "user" });
  const stranger = await mintSession({ userId: "2", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(owner, "بیلبورد مالکیت آزمایشی");
  await decide(adminToken, id, { decision: "revision", note: "اصلاح شود." });

  const res = await api(`/api/listings/${id}`, {
    method: "PATCH", token: stranger,
    body: { name: "بیلبورد مالکیت آزمایشی", phone: "09120000000", type: "billboard", city: "تهران", region: "۱", location: "خیابان تست", width: 10, height: 5, faces: 2, price: 60, plan: "free", images: [] },
  });
  assert.equal(res.status, 404);
});

test("an editor may read the approval queue but not decide (403)", async () => {
  const editorToken = await mintSession({ role: "editor" });
  const queue = await api("/api/admin/listings", { token: editorToken });
  assert.equal(queue.status, 200);
  assert.ok(Array.isArray(queue.json.listings));

  const decision = await api("/api/admin/listings/4/decision", {
    method: "POST", token: editorToken, body: { decision: "approve" },
  });
  assert.equal(decision.status, 403);
});

test("the approval queue is closed to a customer session and to anonymous callers", async () => {
  // Anonymous: 401, because signing in is exactly what would help.
  assert.equal((await api("/api/admin/listings")).status, 401);
  // A customer: 403, because it would not.
  const userToken = await mintSession({ userId: "1", role: "user" });
  assert.equal((await api("/api/admin/listings", { token: userToken })).status, 403);
});

// ── Source guards: the "works on the developer's machine" class ──────
// Prose in AGENTS.md tells the next contributor what not to write; these fail
// the build when someone writes it anyway. Every pattern below shipped once and
// was invisible on localhost. See §24 of docs/engineering-decisions.md.

/** Comments explain these patterns; only real code should trip the guards. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")               // block and JSDoc comments
    .split("\n")
    .filter(l => !/^\s*(\/\/|\*)/.test(l))            // whole-line // and * continuations
    .join("\n");
}

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push([full, stripComments(readFileSync(full, "utf8"))]);
    }
  };
  for (const d of ["app", "components", "lib"]) walk(d);
  out.push(["proxy.ts", stripComments(readFileSync("proxy.ts", "utf8"))]);
  return out;
}

test("guard: the cookie Secure flag is not keyed off NODE_ENV", () => {
  const src = stripComments(readFileSync("lib/auth/session.ts", "utf8"));
  assert.ok(src.includes("isSecureRequest"), "session.ts must derive Secure from the request");
  assert.ok(
    !/NODE_ENV[^\n]*\?\s*\[\s*"Secure"/.test(src),
    'Secure must come from the transport, not from NODE_ENV — `next start` sets production even for the local demo, and a browser drops a Secure cookie sent over http',
  );
});

test("guard: an origin check never compares against req.nextUrl.host", () => {
  for (const [file, src] of sourceFiles()) {
    const offending = src
      .split("\n")
      .filter(l => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .filter(l => /===\s*req\.nextUrl\.host|req\.nextUrl\.host\s*===/.test(l));
    assert.equal(
      offending.length, 0,
      `${file}: nextUrl.host is the server's own bind hostname under \`next start\`, so it never matches a visitor who arrived by LAN IP or domain. Compare against X-Forwarded-Host / Host.`,
    );
  }
});

test("guard: clipboard access goes through lib/client/clipboard.ts", () => {
  for (const [file, src] of sourceFiles()) {
    if (file.endsWith("lib/client/clipboard.ts")) continue;
    assert.ok(
      !/navigator\.clipboard\s*[.?]/.test(src),
      `${file}: navigator.clipboard is undefined outside a secure context (a phone on http://<lan-ip>). Use copyText() from lib/client/clipboard.ts.`,
    );
  }
});

test("guard: no iframe is lazily loaded", () => {
  for (const [file, src] of sourceFiles()) {
    for (const tag of src.match(/<iframe[\s\S]*?\/>/g) ?? []) {
      assert.ok(
        !/loading=["']lazy["']/.test(tag),
        `${file}: a lazy <iframe> below the fold is never requested on a phone — it only appeared after a reload restored the scroll position.`,
      );
    }
  }
});

test("guard: every 429 goes through the shared helper", () => {
  // Four hand-rolled copies of one response is how "X-RateLimit-Limit: 60"
  // outlived a limit that had become 600, and how two of them forgot
  // Retry-After entirely. One path, one place to fix.
  for (const [file, src] of sourceFiles()) {
    if (file.endsWith("lib/http/responses.ts")) continue;
    assert.ok(
      !/status:\s*429/.test(src),
      `${file}: build the 429 with rateLimited() from lib/http/responses.ts — it sets Retry-After, says how long to wait in Persian, and writes the audit row.`,
    );
  }
});

test("guard: an icon-only button carries a name", () => {
  // A <button> whose whole content is an icon is announced as "button" and
  // nothing else. The audit found 29 of them — the theme toggle, the gallery
  // arrows, every modal's close, the star rating — so a keyboard or screen
  // reader user met a row of unnamed controls on the busiest pages.
  //
  // A button is considered named if it has an aria-label, or if any Persian
  // text appears inside it (including inside a ternary or a {label} the caller
  // supplies, which is how the type chips and the sign-in tabs get their text).
  const offenders = [];
  for (const [file, src] of sourceFiles()) {
    if (!file.endsWith(".tsx")) continue;
    for (const m of src.matchAll(/<button\b(.*?)>(.*?)<\/button>/gs)) {
      const [, attrs, inner] = m;
      if (attrs.includes("aria-label")) continue;
      if (/[\u0600-\u06FF]/.test(inner)) continue;
      if (/\{\s*(children|label)\s*\}/.test(inner)) continue;
      // Text supplied from a lookup table or a mapped data array.
      if (/\{\s*\w+\.label\s*\}|\w+Labels\[/.test(inner)) continue;
      offenders.push(`${file}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these buttons render only an icon and have no accessible name — give each an aria-label in Persian:\n  ${offenders.join("\n  ")}`,
  );
});

// ── Radial search ────────────────────────────────────────────────────
// The centre is Valiasr/Vanak; the seed puts one fixture ~0.15 km away, one
// ~8 km away, and one with no coordinates at all.
const CENTRE = { lat: 35.7580, lng: 51.4100 };
const nearQuery = (radiusKm, extra = "") =>
  `/api/billboards?lat=${CENTRE.lat}&lng=${CENTRE.lng}&radiusKm=${radiusKm}${extra}`;

test("a radial search returns what is inside the circle and nothing else", async () => {
  const { status, json } = await api(nearQuery(2));
  assert.equal(status, 200);
  const slugs = json.items.map(i => i.slug);
  assert.ok(slugs.includes("near-centre"), "the fixture 0.15 km away should be inside a 2 km circle");
  assert.ok(!slugs.includes("just-outside"), "the fixture 8 km away should not be");
  // The box is square and the circle is not, so this is the case that catches a
  // search that stops at the bounding box and forgets to cut the corners.
  assert.ok(!slugs.includes("no-coords"), "a row with no coordinates cannot be inside any circle");
});

test("a wider radius reaches further", async () => {
  const near = await api(nearQuery(2));
  const wide = await api(nearQuery(20));
  const wideSlugs = wide.json.items.map(i => i.slug);
  assert.ok(wideSlugs.includes("near-centre"));
  assert.ok(wideSlugs.includes("just-outside"), "8 km away should be inside a 20 km circle");
  assert.ok(wide.json.total > near.json.total, "a wider circle cannot return fewer results");
});

test("the radius has a ceiling, and asking past it is refused", async () => {
  // Without a ceiling, one request with a huge radius is a way to ask for the
  // whole country and walk past the page cap §20 exists to enforce.
  assert.equal((await api(nearQuery(5000))).status, 400);
  assert.equal((await api(nearQuery(0))).status, 400);
});

test("half a centre is refused rather than quietly re-centred", async () => {
  // Keeping the half that parsed would search around a point nobody asked for.
  assert.equal((await api(`/api/billboards?lat=${CENTRE.lat}`)).status, 400);
  assert.equal((await api(`/api/billboards?lng=${CENTRE.lng}`)).status, 400);
  // Neither half is the ordinary catalogue, which still works.
  assert.equal((await api("/api/billboards")).status, 200);
});

test("a radial search still obeys the other filters", async () => {
  // The circle narrows the catalogue; it does not replace it. In particular an
  // unpublished row must not become visible by being nearby.
  const { json } = await api(nearQuery(20, "&availability=available"));
  assert.ok(json.items.every(i => i.availability === "available"));
  assert.ok(!json.items.some(i => i.slug === "inactive-board"));
});

test("a radial search pages correctly", async () => {
  // Radial search cannot be paged by the database — the circle is cut after the
  // rows come back — so the paging is done by hand and is worth checking.
  const all = await api(nearQuery(50, "&limit=48"));
  const first = await api(nearQuery(50, "&limit=1&page=1"));
  const second = await api(nearQuery(50, "&limit=1&page=2"));
  assert.equal(first.json.items.length, 1);
  assert.equal(first.json.total, all.json.total, "total is the size of the circle, not of the page");
  if (all.json.total > 1) {
    assert.notEqual(first.json.items[0].slug, second.json.items[0].slug, "page 2 repeated page 1");
  }
});

test("a password hashed by the seed still signs in", async () => {
  // Every other sign-in test registers its own account first, so the password
  // is hashed by the running server and verified by the running server — which
  // cannot fail even if bcrypt changed underneath. Nothing covered the case
  // that actually breaks on an upgrade: a hash written earlier, by a different
  // version, read back now. That is every account in dev.db and the admin hash
  // in .env, so getting it wrong locks out the whole site silently.
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { phone: "09120000002", password: "secret123" },   // seeded, id 2
  });
  assert.equal(res.status, 200, `seeded credentials were rejected: ${JSON.stringify(res.json)}`);
  assert.ok(tokenFromSetCookie(res), "a successful sign-in must set the session cookie");
});

test("a signed-in customer is refused the panel, not asked to sign in again", async () => {
  // Two different refusals that used to get one answer. Sending a customer who
  // followed a link to /admin to the sign-in form told them their session had
  // failed, so they retyped a password that was never the problem — while an
  // actually signed-out visitor needs exactly that form.
  const customer = await mintSession({ userId: "1", role: "user" });

  const page = await api("/admin", { token: customer, redirect: "manual" });
  assert.equal(page.status, 403, "a signed-in customer should be refused, not redirected");

  const json = await api("/api/admin/billboards", { token: customer });
  assert.equal(json.status, 403);
  assert.equal(json.json.code, "FORBIDDEN");

  // Nobody signed in still gets the sign-in form, which is the right answer there.
  const anon = await api("/admin", { redirect: "manual" });
  assert.ok(
    anon.status === 307 || anon.status === 302,
    `a signed-out visitor should be redirected to sign in, got ${anon.status}`,
  );
});

test("every panel section is its own address, rendered on the server for staff", async () => {
  const admin = await mintSession({ role: "admin" });
  for (const [path, marker] of [
    ["/admin", "نمای کلی داشبورد"],
    ["/admin/billboards", "مدیریت بیلبوردها"],
    ["/admin/listings", "تأیید آگهی‌ها"],
    ["/admin/leads", "سرنخ"],
    ["/admin/quality", "کیفیت"],
    ["/admin/scraper", "اسکرپر"],
    ["/admin/users", "کاربران"],
    ["/admin/audit", "لاگ"],
  ]) {
    const page = await api(path, { token: admin });
    assert.equal(page.status, 200, `${path} did not render for an admin`);
    assert.ok(String(page.json).includes(marker), `${path} is missing "${marker}"`);
  }
});

test("an old ?tab= panel address still lands on its section", async () => {
  const admin = await mintSession({ role: "admin" });
  const res = await api("/admin?tab=billboards&q=valiasr-tower", { token: admin, redirect: "manual" });
  assert.ok(res.status === 307 || res.status === 308, `expected a redirect, got ${res.status}`);
  assert.equal(new URL(res.headers.get("location"), "http://x").pathname + new URL(res.headers.get("location"), "http://x").search, "/admin/billboards?q=valiasr-tower");
});

test("a deactivated staff account is sent to sign in, not shown the panel", async () => {
  // Its token is still validly signed, so proxy.ts lets it through; the panel's
  // own layout reads the account and refuses.
  const revoked = await mintSession({ role: "admin", userId: "9005" });
  const res = await api("/admin/leads", { token: revoked, redirect: "manual" });
  assert.ok(res.status === 307 || res.status === 303, `expected a redirect, got ${res.status}`);
  assert.match(res.headers.get("location") ?? "", /\/admin\/login/);
});

test("guard: a write from the browser goes through fetchJson", () => {
  // A bare fetch() has no timeout, and `await` on a request that never answers
  // never returns — so the `finally` that releases the button never runs and it
  // spins on "در حال ارسال…" forever, with no error and no way back but a
  // reload, which on a form risks sending it twice. §5 asks for a timeout and a
  // defined fallback on every outbound call; lib/client/fetch-json.ts is both.
  //
  // Reads are left alone: a list that fails to load is visibly empty, while a
  // write that hangs looks like it is still working.
  //
  // The admin panel was exempt while B4 landed and is not any more. Staff are
  // behind a session, but a stuck "approve" button is a stuck button whoever is
  // pressing it — and the approval queue is the one screen where a listing is
  // either published or not.
  const WRITE = /fetch\(\s*[`"'][^`"']*[`"']\s*,\s*\{[^}]*method:\s*["'](POST|PATCH|PUT|DELETE)/s;

  for (const [file, src] of sourceFiles()) {
    if (!file.endsWith(".tsx")) continue;
    if (!src.includes('"use client"')) continue;

    assert.ok(
      !WRITE.test(src),
      `${file}: send writes with fetchJson() from lib/client/fetch-json.ts — a bare fetch has no timeout, so a stalled request leaves the button spinning for good.`,
    );
  }
});

test("guard: no credential lockout rests on the address alone", () => {
  // The failure this prevents was measured, not imagined: six failed sign-ins
  // with unrelated emails from one address locked the real administrator out
  // for 852 seconds while holding the correct password. Several real people
  // share one address behind any office, campus or carrier — and card B1
  // records that without a reverse proxy the address is a value the caller
  // simply chooses, so a lockout keyed on it is unfair and escapable at once.
  //
  // A per-address ceiling is fine and stays. What must never come back is a
  // per-address *lockout* on a credential path, because that is the shape that
  // lets one person's mistakes shut out everyone beside them.
  const src = stripComments(readFileSync("lib/rate-limit/index.ts", "utf8"));

  for (const m of src.matchAll(/checkRateLimit\(\s*`([^`]+)`\s*,\s*\{([^}]*)\}/g)) {
    const [, key, body] = m;
    // Only the address dimension: an account-keyed lockout is the intended one.
    if (!key.includes("${ip}")) continue;
    const lockout = /lockoutMs:\s*([^,\n]+)/.exec(body)?.[1]?.trim();
    assert.ok(
      lockout === "0",
      `${key}: a per-address limiter must not lock out (found lockoutMs: ${lockout}). ` +
        `Cap the window instead, and put the tight budget on the account — see credentialAttempt.`,
    );
  }
});

test("guard: every API route goes through defineRoute", () => {
  // Rule 2 of AGENTS.md fixes the order session -> rate limit -> permission ->
  // Zod -> logic. It used to be typed out by hand in every handler, and this
  // test used to grep each admin route for the word "RateLimit" — which is how
  // GET /api/admin/auth/me once shipped without the middle step. The order now
  // lives in one place (lib/http/route.ts) and the compiler requires every
  // route to name its rate limit; what is left to check is that no handler is
  // exported around the pipeline.
  for (const [file, src] of sourceFiles()) {
    const path = file.replaceAll("\\", "/");
    if (!/^app\/api\/.*route\.ts$/.test(path)) continue;
    const methods = [...src.matchAll(/export\s+(?:const|async function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b(.*)/g)];
    assert.ok(methods.length > 0, `${file}: exports no HTTP method`);
    for (const [, method, rest] of methods) {
      assert.ok(
        /^\s*=\s*defineRoute\(/.test(rest),
        `${file}: ${method} must be declared with defineRoute() from lib/http/route.ts, so the session → rate limit → Zod order cannot be skipped.`,
      );
    }
  }
});

test("guard: only signing out is exempt from rate limiting", () => {
  // Throttling sign-out fails in the dangerous direction: someone who taps it
  // twice would be told to wait and left signed in. Nothing else may opt out.
  const EXEMPT = ["app/api/auth/logout/route.ts", "app/api/admin/auth/logout/route.ts"];
  for (const [file, src] of sourceFiles()) {
    const path = file.replaceAll("\\", "/");
    if (EXEMPT.includes(path)) continue;
    assert.ok(!/rateLimit:\s*"none"/.test(src), `${file}: only the sign-out routes may declare rateLimit: "none".`);
  }
});

test("guard: every infinite marquee pauses with the tab", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const paused = css.slice(css.indexOf("html.page-hidden"));
  for (const cls of ["ticker-strip", "related-strip"]) {
    assert.ok(
      paused.includes(cls),
      `.${cls} animates forever; add it to the html.page-hidden list in globals.css so a backgrounded tab stops waking the GPU (§22).`,
    );
  }
});

// ── The session cookie must be storable by the client ────────────────
// `Secure` used to be attached whenever NODE_ENV was "production", which
// `next start` sets — including `npm run demo` on the laptop. A browser
// discards a Secure cookie that arrives over plain HTTP, so a phone opening
// the demo at http://<lan-ip> logged in and was instantly logged out again.
// Chrome exempts http://localhost, which is why it never showed on the
// developer's own machine.

test("a login over plain HTTP does not mark the session cookie Secure", async () => {
  // Register a fresh account rather than reusing a fixture: earlier tests in
  // this file reset fixture passwords, and this test is about the cookie's
  // flags, not about who owns it.
  const phone = randomPhone();
  const reg = await registerUser({ name: "Cookie Test", phone });
  assert.equal(reg.status, 200, JSON.stringify(reg.json));

  const cookie = (reg.headers.getSetCookie?.() ?? []).join("; ");
  assert.match(cookie, /rasamap_session=/);
  assert.ok(!/;\s*Secure/i.test(cookie), `cookie was marked Secure over http and the browser would drop it: ${cookie}`);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
});

test("a login behind an HTTPS proxy does mark the session cookie Secure", async () => {
  const phone = randomPhone();
  const reg = await registerUser({ name: "Cookie Test TLS", phone, headers: { "x-forwarded-proto": "https" } });
  assert.equal(reg.status, 200, JSON.stringify(reg.json));
  const cookie = (reg.headers.getSetCookie?.() ?? []).join("; ");
  assert.match(cookie, /Secure/i);
});

// ── Hotlink protection on listing media ──────────────────────────────
// The check must key off the host the browser actually used. It used to
// compare against req.nextUrl.host, which under `next start` is the server's
// own bind hostname whatever the client asked for — so every visitor who
// arrived by LAN IP or by domain name got 403 on every photo, and the site
// looked image-less on a phone while it looked fine on the laptop.

const ASSET = "/images/scraped/does-not-exist.jpg";

test("a photo request carrying this host's own Referer is not blocked", async () => {
  const { status } = await api(ASSET, {
    headers: { "x-forwarded-host": "rasamap.ir", referer: "https://rasamap.ir/explore" },
  });
  assert.notEqual(status, 403, "same-origin photo request was rejected as a hotlink");
});

test("a photo request from another site is still blocked", async () => {
  const { status } = await api(ASSET, {
    headers: { "x-forwarded-host": "rasamap.ir", referer: "https://clone.example/steal" },
  });
  assert.equal(status, 403);
});

test("a photo request with no Referer at all is allowed", async () => {
  // Direct navigation and some mobile browsers send none; refusing those
  // breaks real users for no gain.
  const { status } = await api(ASSET);
  assert.notEqual(status, 403);
});

// ── Login timing: the anti-enumeration padding must be real work ──────

test("an unknown phone costs about as much as a wrong password (no timing oracle)", async () => {
  // A malformed padding hash makes bcrypt.compare return in ~0 ms, which leaks
  // whether an account exists even though both responses are an identical 401.
  const sample = async (phone) => {
    const t0 = performance.now();
    const res = await api("/api/auth/login", { method: "POST", ip: uniqueIp(), body: { phone, password: "definitely-wrong-password" } });
    assert.equal(res.status, 401);
    return performance.now() - t0;
  };

  // A seeded account that no other test signs in as, so its per-account budget
  // is untouched — two probes stay well inside it.
  const known   = (await sample("09120000004")) + (await sample("09120000004"));
  const unknown = (await sample("09190000001")) + (await sample("09190000002"));

  // Generous bound: bcrypt cost 12 dominates (~250 ms/call), so a missing
  // padding hash shows up as an order-of-magnitude gap, not a few percent.
  assert.ok(
    unknown > known * 0.4,
    `unknown-account login was far too fast (${unknown.toFixed(0)}ms vs ${known.toFixed(0)}ms) — the padding hash is not a real bcrypt hash`,
  );
});
