// API integration tests, run by `npm test` (test/run.mjs): validation,
// allowlists, rate limits, no user enumeration, the listing pipeline,
// object-level authorisation and the anti-scraping limits.
//
// Before touching the setup (§22b, test/README.md):
//  1. It runs against a PRODUCTION server on :3100. Never point it at
//     `next dev`: one test reads the catalogue 120 times, and under dev a
//     request passed the 300 s header timeout and wedged the server.
//  2. Nothing waits on an outside service: without KAVENEGAR_API_KEY the OTP
//     tests read their codes from the local database.
//  3. Every request aborts after 30 s (test/helpers.mjs), so a stall reports itself.
//  4. It resets and seeds its own prisma/test.db; dev.db is never touched.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BASE, api, mintSession, sessionExpiry, tokenFromSetCookie, uniqueIp, randomPhone, pngFile, fakeImageFile, hugePngFile, uploadPath, recoverOtpCode, countOtpRows, registerUser, freshCustomer, storedSize } from "./helpers.mjs";

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
 * Every sort is (featured, hasImages, metric), all descending: asserting the
 * whole tuple is non-increasing checks the real contract, where the metric
 * alone would fail on correct output.
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

test("search folds Arabic letters and matches every word, wherever it is", async () => {
  // photo-board is "Photo Board" in شیراز (test/seed.mjs).
  const find = async (q) => (await api(`/api/billboards?search=${encodeURIComponent(q)}`)).json.items.map(b => b.slug);
  assert.ok((await find("شيراز")).includes("photo-board"), "an Arabic ي must find a Persian ی");
  assert.ok((await find("photo شیراز")).includes("photo-board"), "the words need not sit side by side");
  assert.ok(!(await find("photo تهران")).includes("photo-board"), "every word must match");
});

test("sortBy=traffic_desc orders by estimated views, not by rating", async () => {
  const { status, json } = await api("/api/billboards?sortBy=traffic_desc&limit=48");
  assert.equal(status, 200);
  // Guard against a vacuous pass: the fixtures must actually differ.
  const views = json.items.map((b) => b.traffic?.estimatedViews ?? 0);
  assert.ok(new Set(views).size > 1, "fixtures all share one view count — the assertion would prove nothing");
  assertSortedBy(json.items, (b) => b.traffic?.estimatedViews ?? 0);
});

test("resizing one side in the panel recomputes the stored area", async () => {
  const adminToken = await mintSession({ role: "admin" });
  const [first, second] = await Promise.all([
    api("/api/admin/billboards/3", { method: "PUT", token: adminToken, body: { width: 9 } }),
    api("/api/admin/billboards/3", { method: "PUT", token: adminToken, body: { height: 7 } }),
  ]);
  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.equal(second.status, 200, JSON.stringify(second.json));
  // Both edits land, and area follows the row as it ended, whatever the order.
  const size = await storedSize(3);
  assert.deepEqual(size, { width: 9, height: 7, area: 63 });
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
// A stranger cannot reach an unpublished listing by any means; a reviewer can.

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
  const staff  = await mintSession({ role: "admin" });

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
  const staff = await mintSession({ role: "editor" });
  const { status, json } = await api("/api/auth/me", { token: staff });
  assert.equal(status, 200);
  assert.equal(json.user.isStaff, true);
  assert.equal(json.user.role, "editor");

  const customer = await api("/api/auth/me", { token: await mintSession({ userId: "1", role: "user" }) });
  assert.equal(customer.json.user.isStaff, false);
});

// ── Related media ───────────────────────────────────────────────
// Matching on free-text `region` found nothing, so every page showed the same
// Tehran dozen. City comes first now.

test("suggestions prefer the same city over a higher-ranked one elsewhere", async () => {
  const { status, json: html } = await api("/billboard/valiasr-tower");
  assert.equal(status, 200);

  const strip = html.slice(html.indexOf("related-strip"));
  assert.ok(strip.length > 0, "the related strip is missing from the page");

  const suggested = [...new Set([...strip.matchAll(/href="\/billboard\/([a-z0-9-]+)"/g)].map(m => m[1]))];
  assert.ok(suggested.length > 0, "no suggestions were rendered");
  assert.ok(!suggested.includes("valiasr-tower"), "a listing must not suggest itself");

  // photo-board (Shiraz) outranks the Tehran rows on images, so the city ring
  // must win. Asserted by city, not by one slug: which Tehran fixture ranks
  // first is the sort's business, not this test's.
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
  // 403, not 401: the caller is signed in and lacks the role, as the route
  // handlers answer too.
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
  // Keyed on the account: an address is shared by an office or carrier, and
  // the caller can choose it anyway.
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

// No SMS is sent (§16): the code is read back from the local store. The ~2 s
// is bcrypt plus recoverOtpCode()'s search, both local and bounded.
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

// A phone on a Persian keyboard types ۱۲۳ for numbers, and those are other
// characters than 123. The sign-in form converted them and the reset form did
// not, so a password reset to Persian digits could never be typed back in.
test("digits typed on a Persian keyboard are the same digits in a phone number and a password", async () => {
  const phone = randomPhone();
  const persian = (s) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const registered = await registerUser({ phone, ip: uniqueIp() });
  assert.equal(registered.status, 200, JSON.stringify(registered.json));

  const send = await api("/api/auth/otp/send", {
    method: "POST", ip: uniqueIp(),
    body: { phone: persian(phone), purpose: "password_reset" },
  });
  assert.equal(send.status, 200, JSON.stringify(send.json));
  const code = await recoverOtpCode(phone);

  const reset = await api("/api/auth/otp/verify", {
    method: "POST", ip: uniqueIp(),
    body: { phone: persian(phone), purpose: "password_reset", code, newPassword: "رمز۱۲۳۴۵۶" },
  });
  assert.equal(reset.status, 200, JSON.stringify(reset.json));

  const login = await api("/api/auth/login", {
    method: "POST", ip: uniqueIp(),
    body: { identifier: phone, password: "رمز123456" },
  });
  assert.equal(login.status, 200, "a password set with Persian digits must sign in with Latin ones");
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

  assert.equal((await api("/api/auth/me", { token: self })).status, 200, "the browser that changed it stays in");
  assert.equal((await api("/api/auth/me", { token: other })).status, 401);
});

test("a session ends a week after signing in, however busy it is", async () => {
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const token = await mintSession({ userId: "2", role: "user", signedInAt: eightDaysAgo });
  assert.equal((await api("/api/auth/me", { token })).status, 401, "an old sign-in must not be honoured");
});

test("a session past its idle limit is refused, and one in use is extended", async () => {
  const idle = await mintSession({ userId: "2", role: "user", idleLeftMs: -1000 });
  assert.equal((await api("/api/auth/me", { token: idle })).status, 401);

  const busy = await mintSession({ userId: "2", role: "user", idleLeftMs: 60 * 1000 });
  const before = await sessionExpiry(busy);
  assert.equal((await api("/api/auth/me", { token: busy })).status, 200);
  const after = await sessionExpiry(busy);
  assert.ok(after > before, "a request in the second half of the idle window must push it forward");
});

test("a session cookie whose kind prefix was changed opens nothing", async () => {
  const customer = await mintSession({ userId: "1", role: "user" });
  const forged = "s" + customer.slice(1);
  assert.equal((await api("/api/admin/auth/me", { token: forged })).status, 401);
  assert.equal((await api("/api/auth/me", { token: forged })).status, 401);
});

test("signing in and failing to sign in are both in the durable audit log", async () => {
  const staff = await mintSession({ role: "admin" });
  const email = `audit-probe-${Date.now()}@example.com`;
  await api("/api/auth/login", { method: "POST", ip: uniqueIp(), body: { identifier: email, password: "wrong-password" } });
  const { json } = await api("/api/admin/audit", { token: staff });
  assert.ok(
    json.persisted.some(r => r.action === "login_failure" && r.details?.email === email),
    "a failed sign-in must survive a restart, so it must be in audit_logs",
  );
});

// ── Sign-up behind a phone code ───────────────────────────────────

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
  // Sign-up does not hide a taken number — account creation refuses it anyway,
  // and silence would leave a mistyped number waiting for a code. The per-phone
  // ceiling bounds the abuse.
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
    form: { name: "بیلبورد تست", phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان تست", width: 12, height: 4, faces: 2, price: 50 },
  });
  assert.equal(status, 401);
});

test("POST /api/listings creates a row that is NOT publicly visible yet", async () => {
  const token = await freshCustomer();
  const { status, json } = await api("/api/listings", {
    method: "POST",
    token,
    form: { name: "بیلبورد آزمایشی رایگان", desc: "تست", phone: "09120000000", type: "billboard", city: "تهران", region: "۳", location: "خیابان تست", width: 12, height: 4, faces: 2, price: 50 },
  });
  assert.equal(status, 201, JSON.stringify(json));
  assert.equal(json.listing.moderation, "pending");

  const pub = await api(`/api/billboards?search=${encodeURIComponent("بیلبورد آزمایشی رایگان")}`);
  assert.equal(pub.json.total, 0, "a freshly submitted listing must not appear in search");
});

test("a listing submitted under a Persian name still gets a URL-safe slug", async () => {
  // The public slug route validates `^[a-z0-9-]+$`; a slug carrying Persian
  // characters would publish a row the API then answers 400 for.
  const userToken  = await freshCustomer();
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد نام کاملاً فارسی");
  const admin = await api(`/api/admin/billboards/${id}`, { token: adminToken });
  const slug = admin.json.billboard.slug;
  assert.match(slug, /^[a-z0-9-]+$/, `slug is not URL-safe: ${slug}`);

  await decide(adminToken, id, { decision: "approve" });
  assert.equal((await api(`/api/billboards/${slug}`)).status, 200, "an approved listing must be readable by slug");
});

test("POST /api/listings with the featured plan lands in awaiting_payment", async () => {
  const token = await freshCustomer();
  const { status, json } = await api("/api/listings", {
    method: "POST",
    token,
    form: { name: "بیلبورد ویژه آزمایشی", phone: "09120000000", type: "digital", city: "تهران", location: "خیابان تست", width: 8, height: 3, faces: 1, price: 90, plan: "featured" },
  });
  assert.equal(status, 201, JSON.stringify(json));
  assert.equal(json.listing.moderation, "awaiting_payment");
});

test("POST /api/listings accepts a real PNG upload", async () => {
  const token = await freshCustomer();
  const { status, json } = await api("/api/listings", {
    method: "POST",
    token,
    form: { name: "بیلبورد با عکس", phone: "09120000000", type: "billboard", city: "شیراز", location: "خیابان تست", width: 10, height: 3, faces: 1, price: 40, photos: [pngFile()] },
  });
  assert.equal(status, 201, JSON.stringify(json));
});

test("a photo uploaded while the server is running is served, and nothing outside uploads is", async () => {
  // next start lists public/ once at boot; this photo is written long after.
  const token = await freshCustomer();
  const sent = await api("/api/listings", {
    method: "POST", token,
    form: { name: "بیلبورد عکس تازه", phone: "09120000000", type: "billboard", city: "شیراز", location: "خیابان تست", width: 10, height: 3, faces: 1, price: 40, photos: [pngFile()] },
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
  const token = await freshCustomer();
  const { status, json } = await api("/api/listings", {
    method: "POST",
    token,
    form: { name: "بیلبورد بدافزار", phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان تست", width: 10, height: 3, faces: 1, price: 40, photos: [fakeImageFile()] },
  });
  assert.equal(status, 400, JSON.stringify(json));
  assert.match(json.error, /تصویر/);
});

test("POST /api/listings rejects more than five images", async () => {
  const token = await freshCustomer();
  const { status } = await api("/api/listings", {
    method: "POST",
    token,
    form: { name: "بیلبورد پرعکس", phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان تست", width: 10, height: 3, faces: 1, price: 40, photos: Array.from({ length: 6 }, pngFile) },
  });
  assert.equal(status, 400);
});

test("10 identical listing submissions fired together create exactly one row (race guard)", async () => {
  // No Idempotency-Key is sent, so only the partial unique index on
  // (submittedById, name, city) stands between a double-click and a duplicate.
  const token = await freshCustomer();
  const payload = {
    name: "بیلبورد مسابقه همزمانی", phone: "09120000000", type: "billboard",
    city: "تهران", region: "۱", location: "خیابان تست", width: 12, height: 4, faces: 2, price: 55,
  };

  const results = await Promise.all(
    Array.from({ length: 10 }, () => api("/api/listings", { method: "POST", token, form: payload })),
  );

  const created  = results.filter((r) => r.status === 201).length;
  const rejected = results.filter((r) => r.status === 409).length;
  const other    = results.filter((r) => r.status !== 201 && r.status !== 409);

  assert.equal(created, 1, `expected exactly one 201, got ${results.map((r) => r.status).join(",")}`);
  assert.equal(other.length, 0, `unexpected statuses: ${other.map((r) => r.status).join(",")}`);
  assert.equal(rejected, 9);
});

test("a duplicate listing submitted later is refused with a clear 409", async () => {
  const token = await freshCustomer();
  const payload = {
    name: "بیلبورد تکراری دیرهنگام", phone: "09120000000", type: "billboard",
    city: "اصفهان", location: "خیابان تست", width: 10, height: 3, faces: 1, price: 40,
  };
  assert.equal((await api("/api/listings", { method: "POST", token, form: payload })).status, 201);

  const again = await api("/api/listings", { method: "POST", token, form: payload });
  assert.equal(again.status, 409);
  assert.match(again.json.error, /قبلاً ثبت/);
});

test("a different user may submit a media with the same name (the constraint is per submitter)", async () => {
  const other = await freshCustomer();
  const { status } = await api("/api/listings", {
    method: "POST", token: other,
    form: { name: "بیلبورد تکراری دیرهنگام", phone: "09120000000", type: "billboard", city: "اصفهان", location: "خیابان تست", width: 10, height: 3, faces: 1, price: 40 },
  });
  assert.equal(status, 201);
});

test("listings: a repeated Idempotency-Key replays the first response (no second row)", async () => {
  const token = await freshCustomer();
  const key = "idem-" + Math.random().toString(36).slice(2);
  const payload = { name: "بیلبورد تکراری", phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان تست", width: 12, height: 4, faces: 2, price: 60 };

  const first = await api("/api/listings", { method: "POST", token, form: payload, headers: { "idempotency-key": key } });
  assert.equal(first.status, 201, JSON.stringify(first.json));

  const replay = await api("/api/listings", { method: "POST", token, form: payload, headers: { "idempotency-key": key } });
  assert.equal(replay.status, 201);
  assert.equal(replay.json.listing.id, first.json.listing.id, "the same row must come back, not a new one");
});

test("listings: concurrent requests with one Idempotency-Key run the work once", async () => {
  // Different names, so the partial unique index cannot be what stops them —
  // only the key can. A lookup-then-save let several of these all run.
  const token = await freshCustomer();
  const key = `race-${Date.now()}`;
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => api("/api/listings", {
    method: "POST", token, headers: { "idempotency-key": key },
    form: { name: `بیلبورد کلید همزمان ${i}`, phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان تست", width: 12, height: 4, faces: 2, price: 55 },
  })));
  const ids = new Set(results.filter(r => r.status === 201).map(r => r.json.listing.id));
  assert.equal(ids.size, 1, `the key let ${ids.size} submissions through: ${results.map(r => r.status).join(",")}`);
  assert.ok(results.every(r => r.status === 201 || r.status === 409), results.map(r => r.status).join(","));

  const mine = await api("/api/listings", { token });
  const made = mine.json.listings.filter(l => l.name.startsWith("بیلبورد کلید همزمان"));
  assert.equal(made.length, 1);
});

test("listings: a refused submission leaves its Idempotency-Key free for the retry", async () => {
  const token = await freshCustomer();
  const key = `retry-${Date.now()}`;
  const body = { name: "بیلبورد تلاش دوباره", phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان تست", width: 12, height: 4, faces: 2, price: 55 };
  const bad = await api("/api/listings", { method: "POST", token, headers: { "idempotency-key": key }, form: { ...body, photos: [fakeImageFile()] } });
  assert.equal(bad.status, 400);
  const good = await api("/api/listings", { method: "POST", token, headers: { "idempotency-key": key }, form: body });
  assert.equal(good.status, 201, JSON.stringify(good.json));
});

test("listings: an Idempotency-Key reused by a different user is rejected with 409", async () => {
  const tokenA = await freshCustomer();
  const tokenB = await freshCustomer();
  const key = "idem-cross-" + Math.random().toString(36).slice(2);
  const payload = { name: "بیلبورد مشترک", phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان تست", width: 12, height: 4, faces: 2, price: 60 };

  const a = await api("/api/listings", { method: "POST", token: tokenA, form: payload, headers: { "idempotency-key": key } });
  assert.equal(a.status, 201);
  const b = await api("/api/listings", { method: "POST", token: tokenB, form: payload, headers: { "idempotency-key": key } });
  assert.equal(b.status, 409);
});

// ── Object-level authorisation ───────────────────────────────────────

test("one account cannot submit listings without end, whatever address it uses", async () => {
  // Each submission may carry ten megabytes of photos; a per-address limit let
  // one account fill the disk from a single sign-up.
  const token = await freshCustomer();
  const body = (i) => ({ name: `بیلبورد سقف حساب ${i}`, phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان تست", width: 5, height: 2, faces: 1, price: 10 });
  let last;
  for (let i = 0; i < 11; i++) {
    last = await api("/api/listings", { method: "POST", token, ip: uniqueIp(), form: body(i) });
  }
  assert.equal(last.status, 429);
});

test("a user cannot see another user's listings via GET /api/listings", async () => {
  const tokenA = await mintSession({ userId: "1", role: "user" });
  const tokenB = await mintSession({ userId: "2", role: "user" });

  const created = await api("/api/listings", {
    method: "POST",
    token: tokenA,
    form: { name: "بیلبورد خصوصی کاربر یک", phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان تست", width: 12, height: 4, faces: 2, price: 70 },
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

  assert.equal((await api("/api/admin/auth/me", { token: self })).status, 200, "this device stays in");
  assert.equal((await api("/api/admin/auth/me", { token: other })).status, 401, "every other session ends");
  assert.equal((await signIn("second-pass-2")).status, 200);
});

test("a valid token for a deactivated admin is refused", async () => {
  // The session is real and has not expired. What changed is the account:
  // `active` is false, and every request reads the account with the session.
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
  // A real super_admin: the role is read from the row, so the fixture must hold it.
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
  // Registration has a wide window and no lockout on purpose, so the tight
  // limit worth checking is the per-account sign-in budget.
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
  // Pages have no per-address budget (§20a): 120 reads of what a browser
  // requests, from one address, all succeed. The JSON list has its own
  // budget — see "the catalogue API cannot be paged deep…".
  const ip = uniqueIp();
  for (let i = 0; i < 120; i++) {
    const path = i % 2 ? "/api/billboards/valiasr-tower" : `/explore?page=${(i % 5) + 1}`;
    const res = await api(path, { ip });
    assert.equal(res.status, 200, `read ${i + 1} (${path}) was refused with ${res.status}`);
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

test("an admin edit with a fractional size is refused in words, not with a server error", async () => {
  // The columns are integers; the schema used to accept 10.5 and Prisma threw.
  const editor = await mintSession({ role: "editor" });
  const bad = await api("/api/admin/billboards/6", { method: "PUT", token: editor, body: { width: 10.5 } });
  assert.equal(bad.status, 400, JSON.stringify(bad.json));
  assert.match(bad.json.error, /عدد صحیح/);
  const good = await api("/api/admin/billboards/6", { method: "PUT", token: editor, body: { width: 10 } });
  assert.equal(good.status, 200, JSON.stringify(good.json));
});

test("the photo list keeps only photos the record already has", async () => {
  const editor = await mintSession({ role: "editor" });
  // id 6 (photo-board) carries /uploads/test/1.jpg in the fixtures.
  const keep = await api("/api/admin/billboards/6/images", { method: "PUT", token: editor, form: { photos: ["/uploads/test/1.jpg"] } });
  assert.equal(keep.status, 200, JSON.stringify(keep.json));
  assert.deepEqual(keep.json.images, ["/uploads/test/1.jpg"]);

  for (const foreign of ["https://tracker.example/pixel.png", "/uploads/other/9.jpg"]) {
    const res = await api("/api/admin/billboards/6/images", { method: "PUT", token: editor, form: { photos: [foreign] } });
    assert.equal(res.status, 400, `${foreign} was stored as if it were this record's photo`);
  }
});

test("a bad photo in an admin batch writes none of it, and a good batch is audited", async () => {
  const editor = await mintSession({ role: "editor" });
  const dir = uploadPath("/uploads/billboards");
  const folders = () => { try { return readdirSync(dir).length; } catch { return 0; } };

  const before = folders();
  const bad = await api("/api/admin/billboards/6/images", {
    method: "PUT", token: editor,
    form: { photos: ["/uploads/test/1.jpg", pngFile(), fakeImageFile()] },
  });
  assert.equal(bad.status, 400);
  assert.equal(folders(), before, "the valid photo ahead of the bad one must not be left on disk");

  const good = await api("/api/admin/billboards/6/images", {
    method: "PUT", token: editor,
    form: { photos: [pngFile(), "/uploads/test/1.jpg"] },
  });
  assert.equal(good.status, 200, JSON.stringify(good.json));
  assert.equal(good.json.images[1], "/uploads/test/1.jpg", "order is kept");
  assert.match(good.json.images[0], /^\/uploads\/billboards\/[0-9a-f-]+\/1\.png$/);

  const audit = await api("/api/admin/audit", { token: await mintSession({ role: "admin" }) });
  assert.ok(audit.json.persisted.some(r => r.action === "billboard_images_update"));
});

test("photos a resubmission drops, and those of a deleted listing, leave the disk", async () => {
  const owner = await freshCustomer();
  const adminToken = await mintSession({ role: "admin" });
  const onDisk = (url) => { try { readFileSync(uploadPath(url)); return true; } catch { return false; } };
  const base = { phone: "09120000000", type: "billboard", city: "کرج", region: "۱", location: "خیابان تست", width: 8, height: 3, faces: 1, price: 30, plan: "free" };

  const sent = await api("/api/listings", { method: "POST", token: owner, form: { ...base, name: "بیلبورد پاک‌سازی عکس", photos: [pngFile(), pngFile()] } });
  assert.equal(sent.status, 201, JSON.stringify(sent.json));
  const id = sent.json.listing.id;
  const own = async () => (await api("/api/listings", { token: owner })).json.listings.find(l => l.id === id);
  const [keep, drop] = (await own()).images;
  assert.ok(onDisk(keep) && onDisk(drop));

  await decide(adminToken, id, { decision: "revision", note: "یک عکس کافی است." });
  const resent = await api(`/api/listings/${id}`, { method: "PATCH", token: owner, form: { ...base, name: "بیلبورد پاک‌سازی عکس", photos: [keep] } });
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
    form: { name, phone: "09120000000", type: "billboard", city: "تهران", region: "۱", location: "خیابان تست", width: 12, height: 4, faces: 2, price: 55, plan },
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
  const userToken  = await freshCustomer();
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
  const userToken  = await freshCustomer();
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد ویژه در انتظار پرداخت", "featured");

  const decision = await decide(adminToken, id, { decision: "approve" });
  assert.equal(decision.status, 200, JSON.stringify(decision.json));
  assert.equal(decision.json.listing.moderation, "approved");
  assert.equal(decision.json.listing.featured, true, "confirming payment should grant the featured slot");
});

test("the account that listed a media item cannot rate it", async () => {
  const owner      = await freshCustomer();
  const other      = await freshCustomer();
  const adminToken = await mintSession({ role: "admin" });
  const id = await submitListing(owner, "بیلبورد بدون امتیاز مالک");
  assert.equal((await decide(adminToken, id, { decision: "approve" })).status, 200);

  const body = { billboardId: id, rating: 5, comment: "بهترین رسانه‌ای که دیده‌ام، واقعاً." };
  assert.equal((await api("/api/reviews", { method: "POST", token: owner, body })).status, 403);
  assert.equal((await api("/api/reviews", { method: "POST", token: other, body })).status, 201);
});

test("a decided listing cannot be decided again (409)", async () => {
  const userToken  = await freshCustomer();
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد یک‌بار تصمیم");
  const seen = await seenVersion(adminToken, id);
  assert.equal((await decide(adminToken, id, { decision: "approve", seen })).status, 200);

  const again = await decide(adminToken, id, { decision: "approve", seen });
  assert.equal(again.status, 409);
});

test("a rejected listing is unreachable, not merely absent from search", async () => {
  const userToken  = await freshCustomer();
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
  const userToken  = await freshCustomer();
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد بدون توضیح آزمایشی");

  for (const decision of ["reject", "revision"]) {
    const res = await decide(adminToken, id, { decision });
    assert.equal(res.status, 400, `${decision} without a note must be refused`);
  }
});

test("a revision request parks the listing in needs_revision and the submitter can edit and resend it", async () => {
  const userToken  = await freshCustomer();
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
    form: { name: "بیلبورد نیازمند اصلاح آزمایشی", phone: "09120000000", type: "billboard", city: "تهران", region: "۱", location: "خیابان تست اصلاح‌شده", width: 10, height: 5, faces: 2, price: 60, plan: "free", photos: [] },
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
    form: { name: "بیلبورد نیازمند اصلاح آزمایشی", phone: "09120000000", type: "billboard", city: "تهران", region: "۱", location: "خیابان تست", width: 10, height: 5, faces: 2, price: 60, plan: "free", photos: [] },
  });
  assert.equal(again.status, 409);
});

test("an approval applies only to the version the admin reviewed", async () => {
  // The admin opens a listing sent back for revision; before they click, the
  // submitter resends it with new content. Approving must not publish what
  // nobody looked at.
  const userToken  = await freshCustomer();
  const adminToken = await mintSession({ role: "admin" });
  const name = "بیلبورد نسخه بررسی‌شده";
  const id = await submitListing(userToken, name);
  await decide(adminToken, id, { decision: "revision", note: "عکس اضافه کنید." });

  const seen = await seenVersion(adminToken, id);
  const resent = await api(`/api/listings/${id}`, {
    method: "PATCH", token: userToken,
    form: { name, phone: "09120000000", type: "billboard", city: "تهران", region: "۱", location: "محتوای تازه", width: 12, height: 4, faces: 2, price: 55, plan: "free", photos: [] },
  });
  assert.equal(resent.status, 200, JSON.stringify(resent.json));

  const stale = await decide(adminToken, id, { decision: "approve", seen });
  assert.equal(stale.status, 409, "a decision on an older version must be refused");

  const fresh = await decide(adminToken, id, { decision: "approve" });
  assert.equal(fresh.status, 200, "a decision on the current version goes through");
});

test("only the account that submitted a listing may resubmit it", async () => {
  const owner    = await freshCustomer();
  const stranger = await freshCustomer();
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(owner, "بیلبورد مالکیت آزمایشی");
  await decide(adminToken, id, { decision: "revision", note: "اصلاح شود." });

  const res = await api(`/api/listings/${id}`, {
    method: "PATCH", token: stranger,
    form: { name: "بیلبورد مالکیت آزمایشی", phone: "09120000000", type: "billboard", city: "تهران", region: "۱", location: "خیابان تست", width: 10, height: 5, faces: 2, price: 60, plan: "free", photos: [] },
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
// Each pattern below shipped once and was invisible on localhost (§24).

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
  // An icon-only <button> is announced as just "button" (29 were found). Named
  // means an aria-label, or Persian text anywhere inside, including a ternary
  // or a {label} the caller supplies.
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
  // Every other sign-in test hashes and verifies on the same server. This one
  // reads a hash written earlier — what an upgrade of bcrypt could break for
  // every existing account and the admin hash in .env.
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { phone: "09120000002", password: "secret123" },   // seeded, id 2
  });
  assert.equal(res.status, 200, `seeded credentials were rejected: ${JSON.stringify(res.json)}`);
  assert.ok(tokenFromSetCookie(res), "a successful sign-in must set the session cookie");
});

test("a signed-in customer is refused the panel, not asked to sign in again", async () => {
  // A signed-in customer is refused, not sent to the sign-in form: their
  // password was never the problem. A signed-out visitor gets the form.
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
  // Its session row still exists, so proxy.ts lets it through; the panel's
  // own layout reads the account and refuses.
  const revoked = await mintSession({ role: "admin", userId: "9005" });
  const res = await api("/admin/leads", { token: revoked, redirect: "manual" });
  assert.ok(res.status === 307 || res.status === 303, `expected a redirect, got ${res.status}`);
  assert.match(res.headers.get("location") ?? "", /\/login\?as=staff/);
});

test("guard: a write from the browser goes through fetchJson", () => {
  // A bare fetch() has no timeout: a write that never answers spins its button
  // for good. Client writes go through lib/client/fetch-json.ts; reads are
  // exempt, since a failed list is visibly empty.
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
  // Measured once: six failed sign-ins with other emails from one address
  // locked the real administrator out for 852 s. A per-address ceiling may
  // stay; a per-address lockout on a credential path must not come back.
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
  // The order (rule 2) lives in lib/http/route.ts and the compiler requires a
  // rate limit; what is left to check is that no handler bypasses the pipeline.
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
// `Secure` followed NODE_ENV once, so a phone at http://<lan-ip> dropped the
// cookie and was signed straight out; localhost is exempt, which hid it (rule 9).

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
// Keyed on the host the browser used: req.nextUrl.host (the bind name) once
// refused every photo to a phone on the LAN (rule 9).

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

test("guard: the import graph has no cycle and nothing in lib/ imports app/ or components/", () => {
  // §34 measures both and the thesis states them; this keeps them true. A
  // type-only cycle (lib/auth/actor.ts <-> lib/db/customers.ts) slipped in
  // once and nothing noticed until the numbers were counted again.
  const files = new Map(sourceFiles().map(([f, src]) => [f.replaceAll("\\", "/"), src]));
  const resolve = (spec, from) => {
    let base;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) base = join(from, "..", spec).replaceAll("\\", "/");
    else return null;
    for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      if (files.has(base + suffix)) return base + suffix;
    }
    return null;
  };
  const deps = new Map();
  for (const [file, src] of files) {
    const out = new Set();
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g)) {
      const target = resolve(m[1], file);
      if (target && target !== file) out.add(target);
    }
    deps.set(file, out);
  }

  const upward = [...deps].flatMap(([a, ds]) => [...ds].filter(b => a.startsWith("lib/") && /^(app|components)\//.test(b)).map(b => `${a} -> ${b}`));
  assert.deepEqual(upward, [], "lib/ must not depend on the layers above it");

  const state = new Map();
  const cycles = [];
  const visit = (node, path) => {
    state.set(node, "open");
    for (const next of deps.get(node) ?? []) {
      if (state.get(next) === "open") cycles.push([...path, next].join(" -> "));
      else if (!state.has(next)) visit(next, [...path, next]);
    }
    state.set(node, "done");
  };
  for (const file of deps.keys()) if (!state.has(file)) visit(file, [file]);
  assert.deepEqual(cycles, [], "the import graph must stay acyclic");
});

// ── Moderation after publication ────────────────────────────────
// A published row used to have no way back: the decision route refuses an
// approved listing, and delete refuses a row with reviews.

test("staff can take a published media item down and put it back", async () => {
  const editor = await mintSession({ role: "editor" });
  const viewer = await mintSession({ role: "viewer" });
  const customer = await mintSession({ userId: "1", role: "user" });
  const path = "/api/admin/billboards/7/visibility";

  assert.equal((await api(path, { method: "POST", token: customer, body: { visible: false } })).status, 403);
  assert.equal((await api(path, { method: "POST", token: viewer, body: { visible: false } })).status, 403);

  const down = await api(path, { method: "POST", token: editor, body: { visible: false, note: "محتوای نامناسب" } });
  assert.equal(down.status, 200);
  assert.equal(down.json.moderation, "suspended");
  assert.equal((await api("/api/billboards/takedown-board")).status, 404, "a taken-down row is still public");
  assert.equal((await api("/billboard/takedown-board")).status, 404);

  // A second click cannot flip it twice.
  assert.equal((await api(path, { method: "POST", token: editor, body: { visible: false } })).status, 409);

  const up = await api(path, { method: "POST", token: editor, body: { visible: true } });
  assert.equal(up.status, 200);
  assert.equal((await api("/api/billboards/takedown-board")).status, 200, "the row did not come back");
});

test("a listing still in review cannot be taken down or restored through visibility", async () => {
  const editor = await mintSession({ role: "editor" });
  const res = await api("/api/admin/billboards/4/visibility", { method: "POST", token: editor, body: { visible: true } });
  assert.equal(res.status, 409, "visibility must not become a way past review");
});

test("an editor can remove someone else's review, and the rating follows", async () => {
  const author = await mintSession({ userId: "2", role: "user" });
  const created = await api("/api/reviews", {
    method: "POST", token: author, body: { billboardId: 7, rating: 1, comment: "نظری که مدیر باید بتواند حذفش کند" },
  });
  assert.equal(created.status, 201);
  const id = created.json.review.id;

  const viewer = await mintSession({ role: "viewer" });
  assert.equal((await api(`/api/reviews/${id}`, { method: "DELETE", token: viewer })).status, 404, "a viewer is not a moderator");

  const editor = await mintSession({ role: "editor" });
  assert.equal((await api(`/api/reviews/${id}`, { method: "DELETE", token: editor })).status, 200);
  const after = await api("/api/reviews?billboardId=7");
  assert.ok(!after.json.reviews.some(r => r.id === id));
  assert.equal(after.json.avg, null);
});

test("replying under an unpublished media item is refused", async () => {
  const editor = await mintSession({ role: "editor" });
  const author = await mintSession({ userId: "1", role: "user" });
  const created = await api("/api/reviews", {
    method: "POST", token: author, body: { billboardId: 7, rating: 5, comment: "نظری روی رسانه‌ای که متوقف می‌شود" },
  });
  assert.equal(created.status, 201);
  const reviewId = created.json.review.id;

  const path = "/api/admin/billboards/7/visibility";
  assert.equal((await api(path, { method: "POST", token: editor, body: { visible: false } })).status, 200);
  try {
    const reply = await api(`/api/reviews/${reviewId}/replies`, { method: "POST", token: author, body: { body: "پاسخ زیر رسانهٔ متوقف" } });
    assert.equal(reply.status, 404);
  } finally {
    await api(path, { method: "POST", token: editor, body: { visible: true } });
    await api(`/api/reviews/${reviewId}`, { method: "DELETE", token: author });
  }
});

test("a new password shorter than eight characters is refused everywhere it can be set", async () => {
  const customer = await mintSession({ userId: "2", role: "user" });
  const r1 = await api("/api/auth/me", { method: "PATCH", token: customer, body: { currentPassword: "secret123", newPassword: "short7!" } });
  assert.equal(r1.status, 400);
  const staff = await mintSession({ role: "viewer" });
  const r2 = await api("/api/admin/auth/me", { method: "PATCH", token: staff, body: { currentPassword: "secret123", newPassword: "short7!" } });
  assert.equal(r2.status, 400);
});

// ── Uploads as multipart files, stored outside public/ ─────────

test("a listing's photos are written under UPLOAD_DIR, not into public/", async () => {
  const token = await freshCustomer();
  const sent = await api("/api/listings", {
    method: "POST", token,
    form: { name: "بیلبورد مسیر ذخیره", phone: "09120000000", type: "billboard", city: "شیراز", location: "خیابان تست", width: 10, height: 3, faces: 1, price: 40, photos: [pngFile()] },
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.json));
  const mine = await api("/api/listings", { token });
  const url = mine.json.listings.find(l => l.id === sent.json.listing.id).images[0];
  assert.ok(readFileSync(uploadPath(url)).length > 0, "the photo is not in the upload folder");
  assert.throws(() => readFileSync(join(process.cwd(), "public", url)), "the photo leaked into public/");
});

test("a listing sent as JSON instead of a form is refused, not half-read", async () => {
  const token = await freshCustomer();
  const res = await api("/api/listings", {
    method: "POST", token,
    body: { name: "بیلبورد جیسون", phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان تست", width: 10, height: 3, faces: 1, price: 40 },
  });
  assert.equal(res.status, 400);
});

test("a photo larger than the per-photo ceiling is refused", async () => {
  const token = await freshCustomer();
  const big = new File([Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2 * 1024 * 1024 + 10)])], "big.jpg", { type: "image/jpeg" });
  const res = await api("/api/listings", {
    method: "POST", token,
    form: { name: "بیلبورد عکس بزرگ", phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان تست", width: 10, height: 3, faces: 1, price: 40, photos: [big] },
  });
  assert.equal(res.status, 400);
});

test("a small file that decodes to a gigantic image is refused", async () => {
  // The byte ceiling does not see it: 20000 × 20000 of one colour is about
  // 1.2 MB of PNG. The moderator's browser would be the one to decode it.
  const token = await freshCustomer();
  const res = await api("/api/listings", {
    method: "POST", token,
    form: { name: "بیلبورد عکس غول‌آسا", phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان تست", width: 10, height: 3, faces: 1, price: 40, photos: [hugePngFile()] },
  });
  assert.equal(res.status, 400, JSON.stringify(res.json));
});

test("a photo written under public/uploads by an earlier version is still served", async () => {
  const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const dir = join(process.cwd(), "public", "uploads", "legacy-test");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "1.png"), Buffer.from(await pngFile().arrayBuffer()));
  try {
    const res = await fetch(BASE + "/uploads/legacy-test/1.png", { headers: { "user-agent": "Mozilla/5.0 (rasamap-test-suite)" } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a listing can carry its position, and half a position is refused", async () => {
  const token = await freshCustomer();
  const base = { name: "بیلبورد با موقعیت", phone: "09120000000", type: "billboard", city: "تهران", location: "خیابان ولیعصر", width: 10, height: 3, faces: 1, price: 40 };

  const half = await api("/api/listings", { method: "POST", token, form: { ...base, lat: "35.75" } });
  assert.equal(half.status, 400);
  const abroad = await api("/api/listings", { method: "POST", token, form: { ...base, lat: "48.85", lng: "2.35" } });
  assert.equal(abroad.status, 400, "a point outside Iran is not a position in this catalogue");

  const sent = await api("/api/listings", { method: "POST", token, form: { ...base, lat: "35.7575", lng: "51.4100" } });
  assert.equal(sent.status, 201, JSON.stringify(sent.json));
  const mine = await api("/api/listings", { token });
  const row = mine.json.listings.find(l => l.id === sent.json.listing.id);
  assert.equal(row.lat, 35.7575);
  assert.equal(row.lng, 51.41);
});

test("a listing without an address is refused", async () => {
  const token = await freshCustomer();
  const res = await api("/api/listings", {
    method: "POST", token,
    form: { name: "بیلبورد بی‌نشانی", phone: "09120000000", type: "billboard", city: "تهران", width: 10, height: 3, faces: 1, price: 40 },
  });
  assert.equal(res.status, 400);
});

test("the old staff sign-in address forwards to the one sign-in page", async () => {
  const res = await api("/admin/login?next=/admin/leads", { redirect: "manual" });
  assert.ok([307, 308].includes(res.status), `status ${res.status}`);
  assert.equal(res.headers.get("location"), "/login?as=staff&next=%2Fadmin%2Fleads");
  const offsite = await api("/admin/login?next=//evil.example", { redirect: "manual" });
  assert.equal(offsite.headers.get("location"), "/login?as=staff", "an off-site next must be dropped");
});

// What a stranger can learn about the system from the outside. Each of these
// was either true once or is the usual way a site's internals leak.
test("the internal API reference exists only for staff", async () => {
  // It names every limit and defence, including how a scraper gets past
  // them. To anyone else the address does not exist — 404, not 403.
  assert.equal((await api("/api-docs")).status, 404, "a visitor can read the API reference");
  assert.equal((await api("/api-docs", { token: await mintSession({ role: "user" }) })).status, 404, "a customer can read the API reference");
  const staff = await api("/api-docs", { token: await mintSession({ role: "viewer" }) });
  assert.equal(staff.status, 200);
  assert.match(String(staff.json), /defineRoute/);
});

test("no response names the framework, and no source map is built", async () => {
  for (const path of ["/", "/api/health", "/nope-page"]) {
    assert.equal((await api(path)).headers.get("x-powered-by"), null, `${path} sends X-Powered-By`);
  }
  // A production source map hands out the original source of every client
  // component, comments included. It is off by default; this keeps it off.
  const config = stripComments(readFileSync("next.config.ts", "utf8"));
  assert.doesNotMatch(config, /productionBrowserSourceMaps\s*:\s*true/);
  assert.match(config, /poweredByHeader\s*:\s*false/);
});

// The catalogue as JSON is the cleanest copy a copier can ask for, and the
// site's own pages never call it. One address used to read every row in 80
// requests, in seconds.
test("the catalogue API cannot be paged deep or read in bulk from one address", async () => {
  const deep = await api("/api/billboards?limit=48&page=6");
  assert.equal(deep.status, 400);
  assert.match(deep.json.error, /صفحه/, "the refusal is not explained in Persian");

  const ip = uniqueIp();
  let refusedAt = 0;
  for (let n = 1; n <= 70 && !refusedAt; n++) {
    const res = await api(`/api/billboards?limit=48&page=${((n - 1) % 5) + 1}`, { ip });
    if (res.status === 429) refusedAt = n;
    else assert.equal(res.status, 200);
  }
  assert.equal(refusedAt, 61, "one address was not stopped after its sixty requests");

  // Everyone else — another phone on the same demo Wi-Fi — is untouched, and
  // so are the routes the site's own pages call.
  assert.equal((await api("/api/billboards?limit=48")).status, 200);
  assert.equal((await api("/api/stats", { ip })).status, 200, "the budget spilled onto the site's own reads");
});
