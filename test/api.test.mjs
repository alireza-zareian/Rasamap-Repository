// API integration tests — run via `npm test` (see test/run.mjs).
// Covers: input validation, sort/param allowlists, rate limiting, absence of
// user enumeration, the listing submission pipeline (upload validation and the
// approval state machine), object-level authorisation, and the anti-scraping
// limits.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { api, mintSession, tokenFromSetCookie, uniqueIp, randomPhone, pngDataUrl, fakeImageDataUrl } from "./helpers.mjs";

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

test("GET /api/billboards cannot be tricked into revealing pending rows via ?status", async () => {
  const { json } = await api("/api/billboards?status=pending&limit=48");
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

test("POST /api/billboards/[slug]/contact 404s on an unpublished listing", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status } = await api("/api/billboards/pending-listing/contact", { method: "POST", token });
  assert.equal(status, 404);
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

test("GET /api/admin/leads is 401 for a customer account", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status } = await api("/api/admin/leads", { token });
  assert.equal(status, 401);
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
    body: { name: "Test User", phone: randomPhone(), password: "123" },
  });
  assert.equal(status, 400);
});

test("register rejects a non-Iranian phone number", async () => {
  const { status } = await api("/api/auth/register", {
    method: "POST",
    body: { name: "Test User", phone: "12345", password: "secret123" },
  });
  assert.equal(status, 400);
});

test("register then login: happy path sets a session cookie", async () => {
  const ip = uniqueIp();
  const phone = randomPhone();

  const reg = await api("/api/auth/register", {
    method: "POST",
    ip,
    body: { name: "New User", phone, password: "secret123" },
  });
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

test("login is rate limited per IP", async () => {
  const ip = uniqueIp();
  let last;
  for (let i = 0; i < 12; i++) {
    last = await api("/api/auth/login", {
      method: "POST",
      ip,
      body: { phone: "09120000000", password: "wrong" },
    });
  }
  assert.equal(last.status, 429);
});

// ── Password reset via phone OTP (SMS layer dormant) ──────────────

test("otp/send for an unknown phone is 200 and reveals nothing", async () => {
  const { status, json } = await api("/api/auth/otp/send", {
    method: "POST",
    body: { phone: "09123339999", purpose: "password_reset" },
  });
  assert.equal(status, 200);
  assert.equal(json.devCode, undefined, "no code for a phone that isn't registered");
});

test("otp/send + otp/verify resets the password; the new one then logs in", async () => {
  const phone = "09120000000"; // seeded user 1
  const send = await api("/api/auth/otp/send", {
    method: "POST", ip: uniqueIp(),
    body: { phone, purpose: "password_reset" },
  });
  assert.equal(send.status, 200);
  assert.match(String(send.json.devCode ?? ""), /^\d{6}$/, "dev echo should carry the code in tests");

  const wrong = await api("/api/auth/otp/verify", {
    method: "POST", ip: uniqueIp(),
    body: { phone, purpose: "password_reset", code: "000000", newPassword: "brandnew1" },
  });
  assert.equal(wrong.status, 400);

  const ok = await api("/api/auth/otp/verify", {
    method: "POST", ip: uniqueIp(),
    body: { phone, purpose: "password_reset", code: send.json.devCode, newPassword: "brandnew1" },
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));

  const login = await api("/api/auth/login", {
    method: "POST", ip: uniqueIp(),
    body: { phone, password: "brandnew1" },
  });
  assert.equal(login.status, 200);
  assert.ok(tokenFromSetCookie(login));
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
  assert.equal(json.listing.status, "pending");

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

  await api(`/api/admin/listings/${id}/decision`, { method: "POST", token: adminToken, body: { decision: "approve" } });
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
  assert.equal(json.listing.status, "awaiting_payment");
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

test("GET /api/admin/billboards with role 'user' is 401", async () => {
  const token = await mintSession({ role: "user" });
  const { status } = await api("/api/admin/billboards", { token });
  assert.equal(status, 401);
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
  const token = await mintSession({ role: "admin", userId: "1" });

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
  const token = await mintSession({ role: "admin", userId: "1" });
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
  const created = await api("/api/admin/users", {
    method: "POST",
    token,
    body: { email: `self_${Date.now()}@example.com`, name: "Self", role: "admin", password: "secret123" },
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
  const token = await mintSession({ role: "viewer", userId: "1" });
  const { status } = await api("/api/admin/customers", { token });
  assert.equal(status, 403);
});

test("GET /api/admin/customers returns a paginated directory for an admin", async () => {
  const token = await mintSession({ role: "admin", userId: "1" });
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
  const token = await mintSession({ role: "admin", userId: "1" });
  const { status, json } = await api("/api/admin/customers/1", { token });
  assert.equal(status, 200);
  assert.equal(json.user.id, 1);
  assert.ok(Array.isArray(json.user.listings));
  assert.ok(!("passwordHash" in json.user));
});

test("GET /api/admin/customers/[id] is 404 for an unknown user", async () => {
  const token = await mintSession({ role: "admin", userId: "1" });
  const { status } = await api("/api/admin/customers/999999", { token });
  assert.equal(status, 404);
});

test("PATCH /api/admin/customers/[id] edits the name and audits it", async () => {
  const token = await mintSession({ role: "admin", userId: "1" });
  const patched = await api("/api/admin/customers/2", {
    method: "PATCH", token, body: { name: "Sara Renamed" },
  });
  assert.equal(patched.status, 200, JSON.stringify(patched.json));
  assert.equal(patched.json.user.name, "Sara Renamed");

  const audit = await api("/api/admin/audit", { token });
  assert.ok(audit.json.persisted.some((r) => r.action === "customer_update"));
});

test("POST /api/admin/customers/[id]/reset-password returns a fresh password (never the old one)", async () => {
  const token = await mintSession({ role: "admin", userId: "1" });
  const res = await api("/api/admin/customers/1/reset-password", { method: "POST", token });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(typeof res.json.password, "string");
  assert.ok(res.json.password.length >= 8);

  const audit = await api("/api/admin/audit", { token });
  assert.ok(audit.json.persisted.some((r) => r.action === "customer_password_reset"));
});

test("customer routes are 403 for role 'viewer'", async () => {
  const token = await mintSession({ role: "viewer", userId: "1" });
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
test("a rate-limited write returns 429 with a Retry-After header", async () => {
  const ip = uniqueIp();
  let got429 = null;
  for (let i = 0; i < 8 && !got429; i++) {
    const res = await api("/api/auth/register", {
      method: "POST",
      ip,
      body: { name: `کاربر نرخ ${i}`, phone: `0913${String(1000000 + i).slice(0, 7)}`, password: "secret123" },
    });
    if (res.status === 429) got429 = res;
  }
  assert.ok(got429, "expected a 429 within 8 rapid registrations from one address");
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

test("approving a free listing publishes it and writes a durable audit row", async () => {
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد در انتظار تأیید");

  const decision = await api(`/api/admin/listings/${id}/decision`, {
    method: "POST", token: adminToken, body: { decision: "approve" },
  });
  assert.equal(decision.status, 200, JSON.stringify(decision.json));
  assert.equal(decision.json.listing.status, "available");
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

  const decision = await api(`/api/admin/listings/${id}/decision`, {
    method: "POST", token: adminToken, body: { decision: "approve" },
  });
  assert.equal(decision.status, 200, JSON.stringify(decision.json));
  assert.equal(decision.json.listing.status, "available");
  assert.equal(decision.json.listing.featured, true, "confirming payment should grant the featured slot");
});

test("a decided listing cannot be decided again (409)", async () => {
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد یک‌بار تصمیم");
  assert.equal((await api(`/api/admin/listings/${id}/decision`, { method: "POST", token: adminToken, body: { decision: "approve" } })).status, 200);

  const again = await api(`/api/admin/listings/${id}/decision`, {
    method: "POST", token: adminToken, body: { decision: "approve" },
  });
  assert.equal(again.status, 409);
});

test("a rejected listing is unreachable, not merely absent from search", async () => {
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const name = "بیلبورد رد شده آزمایشی";
  const id = await submitListing(userToken, name);
  const decision = await api(`/api/admin/listings/${id}/decision`, {
    method: "POST", token: adminToken, body: { decision: "reject", note: "تصاویر با مکان اعلام‌شده هم‌خوانی ندارد." },
  });
  assert.equal(decision.status, 200);
  // "rejected", not "inactive": inactive is a public status describing a real
  // media item that is idle, and a turned-down submission must not be public.
  assert.equal(decision.json.listing.status, "rejected");

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
    const res = await api(`/api/admin/listings/${id}/decision`, {
      method: "POST", token: adminToken, body: { decision },
    });
    assert.equal(res.status, 400, `${decision} without a note must be refused`);
  }
});

test("a revision request parks the listing in needs_revision and the submitter can edit and resend it", async () => {
  const userToken  = await mintSession({ userId: "1", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(userToken, "بیلبورد نیازمند اصلاح آزمایشی");

  const sent = await api(`/api/admin/listings/${id}/decision`, {
    method: "POST", token: adminToken,
    body: { decision: "revision", note: "لطفاً ابعاد دقیق سازه را اصلاح کنید." },
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.json));
  assert.equal(sent.json.listing.status, "needs_revision");

  // Not publicly reachable while it waits on the submitter.
  const admin = await api(`/api/admin/billboards/${id}`, { token: adminToken });
  const slug = admin.json.billboard.slug;
  assert.equal((await api(`/api/billboards/${slug}`)).status, 404, "must not be readable by URL");

  // The submitter sees the admin's note and the needs_revision state on their
  // own dashboard feed.
  const mine = await api("/api/listings", { token: userToken });
  const row = mine.json.listings.find(l => l.id === id);
  assert.equal(row.status, "needs_revision");
  assert.equal(row.reviewNote, "لطفاً ابعاد دقیق سازه را اصلاح کنید.");

  // The submitter fixes it and resends — the row re-enters the queue as pending
  // and the review note is cleared.
  const resubmit = await api(`/api/listings/${id}`, {
    method: "PATCH", token: userToken,
    body: { name: "بیلبورد نیازمند اصلاح آزمایشی", phone: "09120000000", type: "billboard", city: "تهران", region: "۱", location: "خیابان تست اصلاح‌شده", width: 10, height: 5, faces: 2, price: 60, plan: "free", images: [] },
  });
  assert.equal(resubmit.status, 200, JSON.stringify(resubmit.json));
  assert.equal(resubmit.json.listing.status, "pending");
  assert.equal(resubmit.json.listing.reviewNote, null);

  const back = await api(`/api/admin/billboards/${id}`, { token: adminToken });
  assert.equal(back.json.billboard.status, "pending");
  assert.equal(back.json.billboard.location, "خیابان تست اصلاح‌شده");

  // A second resubmit is refused — the row is no longer in needs_revision.
  const again = await api(`/api/listings/${id}`, {
    method: "PATCH", token: userToken,
    body: { name: "بیلبورد نیازمند اصلاح آزمایشی", phone: "09120000000", type: "billboard", city: "تهران", region: "۱", location: "خیابان تست", width: 10, height: 5, faces: 2, price: 60, plan: "free", images: [] },
  });
  assert.equal(again.status, 409);
});

test("only the account that submitted a listing may resubmit it", async () => {
  const owner    = await mintSession({ userId: "1", role: "user" });
  const stranger = await mintSession({ userId: "2", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const id = await submitListing(owner, "بیلبورد مالکیت آزمایشی");
  await api(`/api/admin/listings/${id}/decision`, {
    method: "POST", token: adminToken, body: { decision: "revision", note: "اصلاح شود." },
  });

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
  assert.equal((await api("/api/admin/listings")).status, 401);
  const userToken = await mintSession({ userId: "1", role: "user" });
  assert.equal((await api("/api/admin/listings", { token: userToken })).status, 401);
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

test("guard: clipboard access goes through lib/clipboard.ts", () => {
  for (const [file, src] of sourceFiles()) {
    if (file.endsWith("lib/clipboard.ts")) continue;
    assert.ok(
      !/navigator\.clipboard\s*[.?]/.test(src),
      `${file}: navigator.clipboard is undefined outside a secure context (a phone on http://<lan-ip>). Use copyText() from lib/clipboard.ts.`,
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
    if (file.endsWith("lib/api-rate-limit.ts")) continue;
    assert.ok(
      !/status:\s*429/.test(src),
      `${file}: build the 429 with rateLimited() from lib/api-rate-limit.ts — it sets Retry-After, says how long to wait in Persian, and writes the audit row.`,
    );
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
  const reg = await api("/api/auth/register", { method: "POST", body: { name: "Cookie Test", phone, password: "secret123" } });
  assert.equal(reg.status, 200, JSON.stringify(reg.json));

  const cookie = (reg.headers.getSetCookie?.() ?? []).join("; ");
  assert.match(cookie, /rasamap_session=/);
  assert.ok(!/;\s*Secure/i.test(cookie), `cookie was marked Secure over http and the browser would drop it: ${cookie}`);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
});

test("a login behind an HTTPS proxy does mark the session cookie Secure", async () => {
  const phone = randomPhone();
  const reg = await api("/api/auth/register", {
    method: "POST",
    headers: { "x-forwarded-proto": "https" },
    body: { name: "Cookie Test TLS", phone, password: "secret123" },
  });
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

  const known   = (await sample("09120000000")) + (await sample("09120000000"));
  const unknown = (await sample("09190000001")) + (await sample("09190000002"));

  // Generous bound: bcrypt cost 12 dominates (~250 ms/call), so a missing
  // padding hash shows up as an order-of-magnitude gap, not a few percent.
  assert.ok(
    unknown > known * 0.4,
    `unknown-account login was far too fast (${unknown.toFixed(0)}ms vs ${known.toFixed(0)}ms) — the padding hash is not a real bcrypt hash`,
  );
});
