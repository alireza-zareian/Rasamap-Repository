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

test("two identical reservation requests fired together create at most one row (race guard)", async () => {
  const token = await mintSession({ userId: "1", role: "user" });
  // billboard 1 is active and has no reservation in this date window yet
  const payload = { billboardId: 1, startDate: futureDate(200), endDate: futureDate(210) };

  const [a, b] = await Promise.all([
    api("/api/reservations", { method: "POST", token, body: payload }),
    api("/api/reservations", { method: "POST", token, body: payload }),
  ]);

  const created = [a, b].filter((r) => r.status === 201).length;
  const rejected = [a, b].filter((r) => r.status === 409).length;
  assert.equal(created, 1, `expected exactly one 201, got statuses ${a.status}/${b.status}`);
  assert.equal(rejected, 1);
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
