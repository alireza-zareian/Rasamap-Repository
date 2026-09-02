// API integration tests — run via `npm test` (see test/run.mjs).
// Covers: input validation, sort/param allowlists, rate limiting, no user
// enumeration, the reservation race guard, and object-level authorisation.

import test from "node:test";
import assert from "node:assert/strict";
import { api, mintSession, tokenFromSetCookie, uniqueIp, futureDate, randomPhone } from "./helpers.mjs";

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

test("GET /api/billboards/[slug] is 400 for a malformed slug", async () => {
  const { status } = await api("/api/billboards/Bad_Slug!");
  assert.equal(status, 400);
});

test("GET /api/billboards/[slug] never includes the owner phone", async () => {
  const { json } = await api("/api/billboards/valiasr-tower");
  assert.equal(json.billboard.phone, undefined);
});

test("GET /api/billboards/[slug]/contact is 401 without a session", async () => {
  const { status } = await api("/api/billboards/valiasr-tower/contact");
  assert.equal(status, 401);
});

test("GET /api/billboards/[slug]/contact returns the phone to a signed-in user", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status, json } = await api("/api/billboards/valiasr-tower/contact", { token });
  assert.equal(status, 200);
  assert.equal(typeof json.phone, "string");
});

test("GET /api/billboards/pins returns an array", async () => {
  const { status, json } = await api("/api/billboards/pins");
  assert.equal(status, 200);
  const arr = Array.isArray(json) ? json : json.items ?? json.pins;
  assert.ok(Array.isArray(arr));
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

// ── Reservations: validation & race guard ─────────────────────────────

test("POST /api/reservations without a session is 401", async () => {
  const { status } = await api("/api/reservations", {
    method: "POST",
    body: { billboardId: 1, startDate: futureDate(2), endDate: futureDate(5) },
  });
  assert.equal(status, 401);
});

test("POST /api/reservations rejects end-before-start", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status } = await api("/api/reservations", {
    method: "POST",
    token,
    body: { billboardId: 1, startDate: futureDate(5), endDate: futureDate(2) },
  });
  assert.equal(status, 400);
});

test("POST /api/reservations rejects a start date in the past", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status } = await api("/api/reservations", {
    method: "POST",
    token,
    body: { billboardId: 1, startDate: "2020-01-01", endDate: "2020-02-01" },
  });
  assert.equal(status, 400);
});

test("POST /api/reservations blocks an overlapping range with 409", async () => {
  const token = await mintSession({ userId: "1", role: "user" });

  const first = await api("/api/reservations", {
    method: "POST",
    token,
    body: { billboardId: 2, startDate: futureDate(10), endDate: futureDate(20) },
  });
  assert.equal(first.status, 201, JSON.stringify(first.json));

  const overlapping = await api("/api/reservations", {
    method: "POST",
    token,
    body: { billboardId: 2, startDate: futureDate(15), endDate: futureDate(25) },
  });
  assert.equal(overlapping.status, 409);
});

test("10 identical reservation requests fired together create exactly one row (race guard)", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  // billboard 1 is active and has no reservation in this date window yet
  const payload = { billboardId: 1, startDate: futureDate(200), endDate: futureDate(210) };

  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      api("/api/reservations", { method: "POST", token, body: payload }),
    ),
  );

  const created = results.filter((r) => r.status === 201).length;
  const rejected = results.filter((r) => r.status === 409).length;
  const other = results.filter((r) => r.status !== 201 && r.status !== 409);
  assert.equal(created, 1, `expected exactly one 201, got ${results.map((r) => r.status).join(",")}`);
  assert.equal(other.length, 0, `unexpected statuses: ${other.map((r) => r.status).join(",")}`);
  assert.equal(rejected, 9);
});

test("reservations: a repeated Idempotency-Key replays the first response (no second row)", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const key = "idem-" + Math.random().toString(36).slice(2);
  const payload = { billboardId: 2, startDate: futureDate(300), endDate: futureDate(310) };

  const first = await api("/api/reservations", { method: "POST", token, body: payload, headers: { "idempotency-key": key } });
  assert.equal(first.status, 201, JSON.stringify(first.json));

  const replay = await api("/api/reservations", { method: "POST", token, body: payload, headers: { "idempotency-key": key } });
  assert.equal(replay.status, 201);
  assert.equal(replay.json.reservation.id, first.json.reservation.id);
});

test("reservations: an Idempotency-Key reused by a different user is rejected with 409", async () => {
  const tokenA = await mintSession({ userId: "1", role: "user" });
  const tokenB = await mintSession({ userId: "2", role: "user" });
  const key = "idem-cross-" + Math.random().toString(36).slice(2);
  const payload = { billboardId: 1, startDate: futureDate(320), endDate: futureDate(330) };

  const a = await api("/api/reservations", { method: "POST", token: tokenA, body: payload, headers: { "idempotency-key": key } });
  assert.equal(a.status, 201);
  const b = await api("/api/reservations", { method: "POST", token: tokenB, body: payload, headers: { "idempotency-key": key } });
  assert.equal(b.status, 409);
});

// ── Object-level authorisation ───────────────────────────────────────

test("a user cannot see another user's reservations via /api/reservations/my", async () => {
  const tokenA = await mintSession({ userId: "1", role: "user" });
  const tokenB = await mintSession({ userId: "2", role: "user" });

  const booked = await api("/api/reservations", {
    method: "POST",
    token: tokenA,
    body: { billboardId: 1, startDate: futureDate(100), endDate: futureDate(110) },
  });
  assert.equal(booked.status, 201, JSON.stringify(booked.json));

  const listA = await api("/api/reservations/my", { token: tokenA });
  const listB = await api("/api/reservations/my", { token: tokenB });
  assert.equal(listA.status, 200);
  assert.equal(listB.status, 200);

  assert.ok(listA.json.reservations.some((r) => r.billboardId === 1), "owner should see the reservation");
  assert.ok(
    listB.json.reservations.every((r) => r.billboardId !== 1),
    "a different user must not see it",
  );
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
  const token = await mintSession({ role: "super_admin", userId: "1" });
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
  const token = await mintSession({ role: "super_admin", userId: "1" });
  const email = `dup_${Date.now()}@example.com`;
  const body = { email, name: "Dup", role: "viewer", password: "secret123" };
  const first = await api("/api/admin/users", { method: "POST", token, body });
  assert.equal(first.status, 200);
  const second = await api("/api/admin/users", { method: "POST", token, body });
  assert.equal(second.status, 409);
});

test("a super_admin cannot change the role of its own account (409)", async () => {
  const token = await mintSession({ role: "super_admin", userId: "1" });
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

test("POST /api/reviews is 403 without a confirmed reservation for that billboard", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  const { status } = await api("/api/reviews", {
    method: "POST",
    token,
    body: { billboardId: 1, rating: 4, comment: "نظری ندارم واقعاً" },
  });
  assert.equal(status, 403);
});

test("POST /api/reviews succeeds when the user has a confirmed reservation", async () => {
  // seed: user 1 has a confirmed reservation on billboard 3
  const token = await mintSession({ userId: "1", role: "user" });
  const { status, json } = await api("/api/reviews", {
    method: "POST",
    token,
    body: { billboardId: 3, rating: 5, comment: "موقعیت عالی و پرتردد بود" },
  });
  assert.equal(status, 201, JSON.stringify(json));
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

// ── Admin reservation status + audit ────────────────────────────────

test("PATCH /api/admin/reservations/[id]: confirm then cancel, then 409 on a cancelled row", async () => {
  const userToken = await mintSession({ userId: "2", role: "user" });
  const adminToken = await mintSession({ role: "admin" });

  const booked = await api("/api/reservations", {
    method: "POST",
    token: userToken,
    body: { billboardId: 2, startDate: futureDate(500), endDate: futureDate(510) },
  });
  assert.equal(booked.status, 201, JSON.stringify(booked.json));
  const id = booked.json.reservation.id;

  const confirm = await api(`/api/admin/reservations/${id}`, {
    method: "PATCH", token: adminToken, body: { status: "confirmed" },
  });
  assert.equal(confirm.status, 200);

  const cancel = await api(`/api/admin/reservations/${id}`, {
    method: "PATCH", token: adminToken, body: { status: "cancelled" },
  });
  assert.equal(cancel.status, 200);

  const again = await api(`/api/admin/reservations/${id}`, {
    method: "PATCH", token: adminToken, body: { status: "confirmed" },
  });
  assert.equal(again.status, 409);

  const audit = await api("/api/admin/audit", { token: adminToken });
  assert.ok(
    audit.json.persisted.some((r) => r.action === "reservation_status_change"),
    "a reservation_status_change row should be persisted",
  );
});
