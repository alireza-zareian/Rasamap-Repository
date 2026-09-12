# Rasamap — Engineering Decisions

The systems this project runs, **what each one is**, **why it exists**, and
**where it applies**. This is the reference a reviewer (or a report generator)
reads to understand the engineering — not the line-by-line diffs, the shape they
add up to.

Format of each record: **Decision · Context · Structure it produces · Why here ·
Where it applies · How it's verified**.

Companion docs: [`architecture.md`](./architecture.md) (data-flow model),
[`api.md`](./api.md) (endpoint reference), [`STATUS.md`](./STATUS.md) (13-layer
production assessment), [`STATUS.md`](./STATUS.md).

---

## 0. The system at a glance

```
                         ┌──────────────────────────────────────────┐
  browser (client)  ───► │  proxy.ts  — auth boundary + bot filter   │
                         └───────────────┬──────────────────────────┘
                                         │
      ┌──────────────────────────────────┼───────────────────────────────┐
      │                                  │                               │
      ▼                                  ▼                               ▼
  app/**/page.tsx                app/api/**/route.ts            app/billboard/[slug]
  "use client"                   ~23 Route Handlers             React Server Component
  fetch("/api/...")              Zod → rate-limit → logic       reads DB directly
      │                                  │                               │
      └──────────────┬───────────────────┴───────────────┬───────────────┘
                     ▼                                    ▼
           lib/db/billboards.ts  ◄── one data layer ──►  lib/auth/*
           (Prisma 7 + SQLite/WAL)                       session · RBAC · rate-limit · audit
                     │
                     ▼
              SQLite (dev.db)  ── scripts/backup-db.sh ──►  backups/
```

| Layer | Module(s) | State |
|-------|-----------|-------|
| Auth boundary | `proxy.ts` | Guards `/admin/*`, `/api/admin/*`, `/dashboard/*`, `/api/reservations`, `/api/listings`; blocks headless UAs |
| API | `app/api/**/route.ts` | Every route: session check → rate limit → Zod `.safeParse()` → business logic |
| Data access | `lib/db/billboards.ts`, `lib/db/client.ts` | The only path to billboard/reservation reads and writes |
| Types | `lib/types.ts` | Domain types + label maps, **data-free** |
| Auth internals | `lib/auth/{session,users,rate-limit,audit,client-ip}.ts` | JWT, RBAC, sliding-window limits, audit, trusted-proxy IP |
| Observability | `lib/logger.ts`, `lib/api-error.ts` | JSON-line logs, user-facing error reference ids |
| Config safety | `lib/env.ts`, `instrumentation.ts` | Fail-closed env validation at boot |
| Recovery | `scripts/backup-db.sh` | Online SQLite backup + tested restore |
| Tests | `test/` | Dependency-free API suite + load benchmark |

---

## 1. One data layer, two entry paths

**Decision.** All billboard/reservation data access goes through
`lib/db/billboards.ts`. The browser reaches it over `/api/...`; a Server
Component reaches it by calling it directly.

**Context.** A Next.js full-stack app can serve data two ways. Routing every
page through an internal HTTP call to itself is slower and is an anti-pattern;
letting each page query Prisma independently duplicates logic and invites drift.

**Structure it produces.** A single module owns every query. Route handlers and
the `/billboard/[slug]` Server Component import the same functions
(`getFilteredBillboards`, `getBillboardBySlug`, …). No query is written twice.

**Why here.** The dataset changes (scraper, admin CRUD, reservations); the
client needs live filtering and pagination → those go over `/api/`. The detail
page renders once on the server → it reads the DB directly (one hop, no JSON
round-trip). Full rationale + performance table in `architecture.md`.

**Where it applies.** All of `app/api/**` and `app/billboard/[slug]/page.tsx`.

**Verified.** `test/api.test.mjs` exercises the API path; the data-access map in
`architecture.md §5` is checked against the source.

---

## 2. Fixed request pipeline on every API route

**Decision.** Order is **session check → rate limit → Zod → business logic**,
never reordered.

**Context.** Rate-limiting before auth lets an anonymous caller exhaust the
bucket. Validating before rate-limiting lets an attacker send oversized bodies
for free. `.parse()` throws → unhandled 500; `JSON.parse(body)` skips
validation.

**Structure it produces.** Each `route.ts` reads top-to-bottom in the same
sequence. `Zod.safeParse()` is the only parser. Sort/filter values are checked
against explicit allowlists before touching a query.

**Why here.** It is the cheapest way to make 23 hand-written endpoints uniformly
safe, and it is enforced as a project rule (`AGENTS.md`, `CLAUDE.md`).

**Where it applies.** Every file in `app/api/`.

**Verified.** `test/api.test.mjs` — allowlist rejection, oversized `limit`,
unknown `type`, 401-before-anything on admin routes, RBAC 403.

---

## 3. Authentication & authorisation

**Decision.** JWT (jose, HS256) in an HttpOnly `SameSite=Strict` cookie;
role hierarchy `viewer < editor < admin < super_admin` plus `user`; the
endpoint — not the UI — is the security boundary.

**Context.** Being logged in proves identity, not permission. Hiding a button is
convenience.

**Structure it produces.** `lib/auth/session.ts` mints/verifies the token and
fails closed if `AUTH_SECRET` < 32 chars. `lib/auth/users.ts::hasPermission()`
is the single RBAC check. `proxy.ts` rejects unauthenticated access to guarded
paths before the handler runs; each admin handler re-checks the role. Login is
timing-safe (bcrypt runs even when the user is absent) and returns an identical
body for "wrong password" and "unknown account".

**Why here.** A single mistake in auth ends projects, so it leans on
battle-tested primitives (jose, bcrypt cost 12) rather than anything hand-rolled.

**Where it applies.** `proxy.ts`, every `app/api/admin/**`, `app/api/auth/**`,
`app/api/reservations`, `app/api/listings`. Admin accounts themselves live in
the `admins` table and are managed from the super-admin panel
(`/api/admin/users`, `super_admin` only): create hashes with bcrypt, role/active
changes refuse to touch the caller's own row so a super-admin can't lock itself
out, every change is audit-logged.

**Verified.** Tests: no user enumeration, 401 without a session, 401 for role
`user` on admin routes, 403 for `viewer` on a write, object-level scoping on
`/api/reservations/my`.

---

## 4. Rate limiting with a non-spoofable client identity

**Decision.** Sliding-window limits per IP and per user, with named buckets
(`login` 10/15min, `register` 5/hr, `publicApi` 60/min, `adminApi` 120/min, …).
The IP comes from `lib/auth/client-ip.ts::getClientIp()`, which reads the entry
the outermost **trusted** proxy saw — not `X-Forwarded-For`'s leftmost value.

**Context.** `X-Forwarded-For`'s first entry is client-set. Taking it
(`.split(",")[0]`) lets a caller send a fresh fake IP per request and dodge
every per-IP limit — a real bypass, exploitable from a browser console.

**Structure it produces.** One `getClientIp(req)` helper, `TRUSTED_PROXY_COUNT`
(default 1; `0` ignores `X-Forwarded-For` entirely). Replaced 20 duplicated
inline extractions across the API. Limits live in `lib/auth/rate-limit.ts` as
an in-memory sliding window (documented limitation: resets on restart, not
multi-instance — acceptable for a single-instance demo).

**Lockout durations are deliberate, not one-size.** Credential-guessing paths
(`login`, `register`) keep a long lockout (15 min / 1 hr) — that is the point.
The general `userApiRateLimit` (60/min: booking, review, phone reveal) uses a
short **2-minute** cooldown: passing 60/min there means a script or a stuck
button, and an accidental double-tap storm on a failing form should not lock a
real person out for a quarter hour. `lib/api-rate-limit.ts::rateLimited()` is
the single 429 shape — `Retry-After` header + a Persian "try again in N
minutes" message + a `retryAfter` field the client shows — and it writes
exactly one durable `rate_limit_hit` audit row per lockout (the request that
trips it, flagged by `justLocked`); the repeated 429s that follow stay in the
in-memory log only, so a burst cannot flood `audit_logs`.

**Why here.** Login, registration, password paths, search and every write are
the endpoints an abuser hammers; the fix is one small helper, not a service.

**Where it applies.** All rate-limited routes; audit log IP field.
`rateLimited()` wired into `POST /api/reservations`.

**Verified.** Tests: 12 rapid logins from one IP → `429`; 60+ rapid reservation
POSTs → `429` with a positive `Retry-After` and a Persian message naming the
minutes. Benchmark: `BENCH_SINGLE_IP=1` shows 60 requests then `429`.

---

## 5. Concurrency & correctness — the reservation flow

**Decision.** The overlap check and the insert run inside one
`prisma.$transaction`. `POST` responses are safe to retry (planned:
`Idempotency-Key`). The submit button is disabled in flight.

**Context.** "Check then insert" without a lock or constraint is a race: two
concurrent bookings both read "free", both write. A network retry or a double
click can create two rows.

**Structure it produces.** `app/api/reservations/route.ts` — count overlapping
non-cancelled reservations, then create, atomically; on overlap return `409`.
The client (`BookingModal`) disables the button while the request is in flight.

**Why here.** The reservation is the one transactional write in the product; a
double-book in front of a reviewer would be the worst failure.

**Where it applies.** `POST /api/reservations` (and, once added, an
`Idempotency-Key` table + a `Reservation(billboardId,userId,startDate,endDate)`
unique constraint as a DB-level floor).

**Verified.** Test: **10 identical concurrent POSTs → exactly one 201, nine
409s**. Under write load the first hard limit is SQLite's single-writer lock —
named, not hidden.

---

## 6. Input validation & injection surface

**Decision.** `Zod.safeParse()` on every input; ORM-only queries (no
string-built SQL); allowlists for anything that reaches a query as an
identifier (sort keys, types, statuses).

**Structure it produces.** Each route declares a Zod schema next to the handler.
Prisma is the only query builder. `getClientIp`, slug regexes, numeric coercion
with bounds (`limit` 1–100, `page` 1–1000) cap every parameter.

**Where it applies.** All of `app/api/`.

**Verified.** Tests: `sortBy=price_asc;DROP TABLE` → 400, `limit=99999` → 400,
malformed slug → 400.

---

## 7. Observability — structured logs + user-facing error references

**Decision.** One JSON object per log line (`lib/logger.ts`), size-rotated to a
file when `LOG_DIR` is set, stdout otherwise. Unexpected errors get a short
reference id via `lib/api-error.ts::serverError()` — logged with the stack,
shown to the user, never the internals.

**Context.** `console.error` scattered through handlers is not searchable, and a
bare 500 leaves neither the user nor the operator knowing what failed.

**Structure it produces.** `logger.{debug,info,warn,error}(msg, fields)` →
`{ts, level, msg, …}`. `serverError("GET /api/x", err)` → logs
`{ref, error, stack}` and returns `{ error: "<generic Persian>", ref }` with
status 500. `app/error.tsx` surfaces `error.digest` as «کد خطا». Rule: log
`userId`, never a phone/name/token.

**Persisting to a file.** `lib/logger.ts` writes to stdout/stderr by default;
set `LOG_DIR` and every line is also appended to `<LOG_DIR>/app.log`, rotated
at 10 MB with 5 backups. `auditLog()` now emits through this same logger (not a
bare `console.*`), so audit and `rate_limit_hit` lines land in that file too —
a durable, greppable incident record without a per-request DB row.

**Why here.** It is the self-hosted, zero-dependency equivalent of an
error-tracking service — no paid platform, works offline. Pattern taken from a
Django reference project's `log_formatters.py` + middleware.

**Where it applies.** `serverError` in the route catch blocks; `logger` in
`env` validation and `persistAudit`. **Every** API route is wrapped with
`withApiLog(name, handler)` (`lib/api-log.ts`), so each request emits one
`api_request` line — `route`, `method`, `path`, `status`, `ms` — and nothing
about the body, query string, headers, or user beyond an id.

**Verified.** A forced 500 returns a `ref` and no stack, and the same `ref`
appears in the log. `api_request` lines confirmed for GET and POST, including a
401 login (`{"msg":"api_request","route":"auth/login","status":401,...}`).

### 7a. Why not Docker / a real log stack yet — and the path to it

**The question a reviewer asks.** "Serious systems ship logs to Docker /
journald / ELK / Loki / CloudWatch. Why does this project write JSON lines to
stdout and one SQLite table?"

**Answer — same model, smaller footprint.** A production log pipeline has three
parts: (1) the app emits **structured lines**, (2) the runtime **captures**
them (a container's stdout, a systemd unit's journal), (3) a **shipper/store**
indexes them for search and alerting. This project already does (1) properly —
one JSON object per line, one `api_request` per request, one `rate_limit_hit`
per lockout, audit rows for every admin mutation. (2) and (3) are
**deployment concerns, not code**: the moment this runs in a container,
`docker logs` *is* the capture layer, and pointing Promtail→Loki or Fluent
Bit→Elasticsearch at that stream needs zero application change — the log
*format* was designed for exactly that hand-off. Adding a hosted logging SDK
now (Sentry, Datadog, Better Stack) would mean a paid, region-blocked
dependency for a single-instance thesis demo — explicitly out of scope — and
would not teach anything the stdout+file approach doesn't.

**What is deliberately kept in-app.** The `audit_logs` **table** is not
"logging" in the pipeline sense — it is a business record ("who confirmed this
reservation", "who reset this user's password") that must survive a restart,
be queryable from the admin UI, and be reasoned about like domain data. That
belongs in the database regardless of what the log pipeline looks like. This
mirrors the Django reference project's dedicated `statuslog` app.

**The path to "real" infra, when it's warranted.**
1. **Containerise.** stdout is already the log surface; `docker logs` / the
   orchestrator captures it. Set `LOG_DIR` to a mounted volume if a file copy
   is also wanted.
2. **Ship.** Add a sidecar/agent (Promtail, Fluent Bit, Vector) that tails
   stdout or `app.log` and pushes to Loki / Elasticsearch / OpenSearch —
   self-hostable, no code change.
3. **Correlate.** The per-request `ref` id and `route`/`status`/`ms` fields are
   already the query keys; build dashboards and alert rules on them.
4. **Scale the rate limiter with it.** The in-memory limiter (§4) becomes
   Redis-backed at the same time multi-instance arrives; its `rate_limit_hit`
   events then aggregate across nodes in the same store.

None of this changes a line of handler code — which is the point of emitting
structured logs from day one.

---

## 8. Audit trail for sensitive actions

**Decision.** Admin mutations write a durable row to the `audit_logs` table via
`lib/auth/audit.ts::persistAudit()`, in addition to the in-memory ring buffer.

**Context.** "Who changed this reservation, and when" must be answerable after a
dispute — and after a restart, which the ring buffer does not survive.

**Structure it produces.** `persistAudit({action, adminId, userEmail, ip,
userAgent, details})` → `audit_logs` row (`adminId` folded into
`details.actorId`, since the JWT admin has no `admins` FK row). Actions:
`billboard_create` / `billboard_update` / `billboard_delete` /
`reservation_status_change` (records `from`→`to`). `GET /api/admin/audit`
returns `{ logs, persisted }`. Best-effort — an audit-write failure is logged
and never breaks the operation.

**Why here.** The mutations already existed; this adds the receipts. No
migration needed — the table was already in the schema. Pattern from the Django
reference's decoupled `statuslog` app.

**Where it applies.** `POST/PUT/DELETE /api/admin/billboards`,
`PATCH /api/admin/reservations/[id]`, `POST /api/admin/users`,
`PATCH /api/admin/users/[id]` (`admin_user_create` / `admin_user_update`,
severity `warn`).

**Verified.** Test: an admin create lands in `persisted[]` with
`action: "billboard_create"`.

---

## 9. Fail-closed configuration

**Decision.** `lib/env.ts` (run once from `instrumentation.ts` at boot)
validates required env with Zod and throws a list of what's missing; the server
does not start on an insecure default.

**Structure it produces.** Required: `DATABASE_URL`, `AUTH_SECRET` (≥32),
`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_NAME`. Optional (format-checked, not
required): `NESHAN_*`, `LOG_*`, `TRUSTED_PROXY_COUNT`. A missing map key warns
rather than aborts.

**Why here.** A predictable fallback secret is worse than a crash. Pattern from
the Django reference's `settings.py` (`ImproperlyConfigured` on missing
`SECRET_KEY` / `CACHE_URL`).

**Where it applies.** Server startup (`next dev`, `next start`) — not the build.

**Verified.** Real `next dev` boots clean; the test harness sets all five.

---

## 10. Client bundle discipline

**Decision.** `lib/data.ts` (static + scraped arrays + a 4 MB `billboards.json`
import) is imported **only** by `prisma/seed.ts`. Everything else takes types
and label maps from `lib/types.ts`, which imports no data.

**Context.** `lib/data.ts` previously mixed pure types, a small `typeLabels`
map, and the JSON import in one module. A client component importing
`typeLabels` dragged the whole module — a **6.7 MB chunk** of scraped billboard
JSON shipped to every visitor.

**Structure it produces.** Two files: `lib/types.ts` (data-free, import
anywhere) and `lib/data.ts` (build-time only). Client chunk total **7.7 MB →
1.0 MB**.

**Verified.** `grep` of `.next/static/chunks` — the `JSON.parse('[{"id":…')`
chunk is gone; `npm run build` OK; `npm test` unchanged.

---

## 11. Caching strategy

**Decision.** `Cache-Control: public, max-age=<n>, stale-while-revalidate=<m>`
on cacheable GET routes; `no-store` on anything user-specific or write-related.

**Structure it produces.** `/api/billboards` 60 s, `/api/billboards/[slug]`
60 s, `/api/billboards/pins` 300 s, `/api/stats` 120 s, `/api/analytics` 60 s,
`/api/reviews` 30 s. `/api/reservations*`, `/api/auth/*`, `/api/admin/*` →
`no-store`. Server-side pagination caps every list payload regardless of dataset
size.

**Why here.** These endpoints are read-heavy and change slowly; a shared cache
key never carries user data.

**Where it applies.** All public GET routes.

---

## 12. Recovery

**Decision.** `scripts/backup-db.sh` (`npm run db:backup`) — online SQLite
`.backup`, keeps the last 10, `BACKUP_DIR` override, cron one-liner documented.
A test restore is performed and recorded, not assumed.

**Structure it produces.** `backups/` (git-ignored). `RUNBOOK.md` carries the
restore steps and the rollback procedure (git tag → `npm ci` → rebuild →
restart, target under 2 minutes).

**Verified.** Restore run 2026-09-01: row counts matched, `PRAGMA
integrity_check` = ok.

---

## 13. Testing

**Decision.** A dependency-free API suite (`npm test`): Node's built-in
`node:test` + `fetch` against a real `next dev` server on an isolated
`prisma/test.db` — never `dev.db`. Plus `npm run bench`, a small load
benchmark.

**Structure it produces.** `test/run.mjs` orchestrates reset → seed → server →
run → teardown. `test/api.test.mjs` covers validation, allowlists, rate limits,
no user enumeration, the reservation race guard, object-level authz, RBAC, and
the durable audit. `test/bench.mjs` rotates the source IP to measure throughput
past the rate limiter.

**Why here.** It is the honest answer to "how do you know it works", and it
replaces error-prone manual checking. No Jest/Vitest, no foreign services.

**Verified.** `npm test` — 25 passing. Benchmark reference numbers in
`test/README.md`.

---

## 14. Database engine — SQLite now, Postgres later, no rewrite

**Decision.** SQLite via Prisma for the whole project; the migration path to
Postgres is a config change, not a code change.

**Context.** The data started as hardcoded arrays in `lib/data.ts` — fine for
prototyping, wrong the moment the data became mutable (scraper, admin edits,
reservations). A real store was needed. SQLite is a full ACID SQL engine that
runs as a library on one file rather than as a separate server.

**Structure it produces.** One file (`dev.db`), zero database ops, WAL mode for
concurrent readers. Prisma owns the schema (`prisma/schema.prisma`), generates
a type-safe client, and versions changes under `prisma/migrations/`. The entire
app talks to the DB through `lib/db/billboards.ts` — no route calls `prisma`
directly, no string-built SQL anywhere.

**Why here.** The workload is read-heavy (a ~3.5k-row catalogue, filtered and
paginated constantly), has one transactional write path (reservations, rare,
serialised in a transaction), and runs as a single instance for a thesis demo.
For that shape SQLite is the *correct* tool, not a compromise: fastest reads,
nothing to install, a backup is a file copy. Consciously given up: truly
concurrent writes (one writer at a time), multi-machine access, built-in
replication — none of which this scale needs. First hard limit under write load
is the single-writer lock on `POST /api/reservations`, named in
`architecture.md`.

**Migration path.** Because everything goes through Prisma + one `lib/db/`
module, moving to Postgres is: change the `datasource` provider + connection
string, run migrations — **no query rewrites**. That is the payoff for using an
ORM. Real production (many concurrent writers, multiple app servers, managed
backups) → Postgres, as a planned "later", not a gap.

**Migration hygiene.** Earlier iterations used `prisma db push` (mutates the DB
without a migration file), so `dev.db` drifted ahead of
`prisma/migrations/`. Migration `20260901123000_reconcile_billboards_schema`
(generated with `prisma migrate diff`) closes that gap: a clean
`git clone → npm ci → prisma migrate deploy → npm run db:seed` now builds the
correct schema and seeds 3545 rows. `prisma migrate status` reports "up to
date". From here, schema changes go through `prisma migrate`, not `db push`.

**Verified.** `npm test` runs the full suite against a real (isolated) SQLite
DB; `npm run db:backup` + a recorded restore prove the recovery story.

---

## 15. Demo dataset & self-hosted API reference

**Decision.** `npm run db:seed:demo:full` builds a broad, idempotent demo
dataset; `/api-docs` renders the API reference in-app with no external
dependency.

**Structure it produces.** `prisma/seed-demo-full.ts` upserts 8 users (one per
meaningful state — full dashboard, only-pending, fresh signup, cancelled,
reviewer, multi-city, history-only, owner), 4 admins (one per role), 3 owners +
4 `pending` listings, 13 reservations across every status, 3 reviews. All
demo-only records carry a `[DEMO]` tag; the real admin row is left untouched;
it refuses to run against the test DB. The account sheet is kept in
`RUNBOOK.md`. `app/api-docs/page.tsx` is a Server Component that
reads `docs/api.md` and renders it (escaped-first, fixed transform set — no
markdown library, no CDN); `next.config.ts` traces the file into the prod build.

**Why here.** A reviewer needs realistic data to click through, and a stranger
needs to see the API surface without a foreign service. Both stay in-repo and
work offline.

**Verified.** Seed re-run is idempotent (counts stable); `/api-docs` returns 200
with rendered tables under `next start`.

---

## 16. SMS & phone-verified flows — built, shipped dormant

**Decision.** The full SMS layer (Kavenegar) and the phone-OTP flows — password
reset, and since 2026-09-12 sign-up as well — are implemented and tested, but
inert until `KAVENEGAR_API_KEY` is set. Nothing about registration, login or the
OTP endpoints breaks while it's off; without a line the code is written to the
log instead of sent, which is enough for a demo and not enough for production.

**Why it ships disabled, not omitted.** A Kavenegar line needs a paid minimum
top-up and a verified sender — not worth doing for a capstone demo, and the
project rule bars standing up a paid service just to tick a box. Leaving the
feature *out* would mean re-deriving the design under deadline later; leaving it
*in but dormant* means the reviewer can read the backend, the tests prove it
works, and switching it on is one env var + a redeploy. This is the same
"structured from day one, wire the vendor in later" stance as the logging stack
(§7a).

**Structure it produces.**
- `lib/sms.ts` — Kavenegar adapter. `smsEnabled` (derived from the key) gates
  every call; no path throws. `sendSms()` for plain text; `sendOtp()` uses
  Kavenegar's dedicated verify-lookup line when `KAVENEGAR_OTP_TEMPLATE` is set
  (higher deliverability, no sender approval), else a plain SMS. Logs a masked
  phone only — never the number or the code.
- `lib/otp.ts` + `otp_codes` table (hand migration `20260902090000`) — 6-digit
  codes, stored only as an HMAC-SHA256 hash keyed by `AUTH_SECRET`, 5-minute
  TTL, single-use, 5-attempt cap, rows older than a day pruned opportunistically.
- `POST /api/auth/otp/send` + `/verify` — public, rate-limited per phone **and**
  per IP (`otpSendRateLimit` 3/10 min, `otpSendIpRateLimit` 40/hr,
  `otpVerifyRateLimit` 10/10 min). `send` takes a `purpose`, and the two
  purposes read the same row in opposite directions: a `password_reset`
  responds identically whether or not the number is registered (no account
  enumeration), while a `register` answers 409 on a number that already has an
  account — the step that creates the account has to refuse a duplicate anyway,
  so silence there would buy nothing and would leave someone who mistyped a
  digit waiting for a code that was never coming. `verify` is password-reset
  only: it checks the code and sets the new bcrypt hash in one step — no
  intermediate token — and audits it as `password_reset_self`. `OTP_DEV_ECHO=1`
  returns the code in the `send` response for local testing (ignored under
  `NODE_ENV=production`).
- `/reset-password` — a 3-step page (phone → code + new password → done), linked
  from `/login` as «رمز عبور را فراموش کرده‌اید؟».
- `POST /api/auth/register` — takes the six-digit `code` alongside name, phone
  and password, and creates nothing until `verifyOtp(phone, "register", code)`
  passes. The duplicate-phone check runs *before* the code is spent, so being
  told a number is taken does not cost the caller their one-use code. The code
  is consumed by the register call itself, so there is no window in which a
  number is verified but no account exists. `/login`'s sign-up tab is two steps:
  number → code + name + password.
- Register hook — a fire-and-forget welcome SMS after `prisma.user.create`;
  it can never fail the sign-up.

**How to switch it on.** Buy a Kavenegar line, put `KAVENEGAR_API_KEY` (and
optionally `KAVENEGAR_SENDER` / `KAVENEGAR_OTP_TEMPLATE`) in `.env`, redeploy.
No code change: the welcome SMS and the reset flow start delivering
immediately. `.env.example` documents every knob.

**Verified.** Tests: an unknown phone gets a generic 200 and no code; a full
send → verify → login with the new password succeeds; a wrong code is rejected;
the per-phone send limit returns 429 with `Retry-After`. For sign-up: a register
without a code creates nothing (checked by asking the sign-in endpoint, not by
trusting the refusal); a wrong code is rejected and the right one still works
afterwards; a `register` code cannot be spent on a password reset; one code
cannot open two accounts; and `otp/send` for a taken number issues no row.

---

## 17. The business model: a directory, not a booking engine

**Decision.** Rasamap lists media it does not own. Revenue comes from the
listing side (the media owner pays to be listed), not from the buyer. There is
no online reservation and no checkout.

**Why.** The original build had a full "رزرو آنلاین" flow: pick a date range,
see a total with duration discounts, submit. That flow claims something the
platform cannot deliver — Rasamap holds no inventory, signs no contract and
takes no money for the space, so a "reservation" it issues is not binding on the
owner. The modal's own text already admitted this ("کارشناسان رسامپ برای
هماهنگی با صاحب رسانه با شما تماس می‌گیرند"): the booking engine was an
inquiry form wearing a checkout's clothes. An examiner asking "how do you
actually reserve a billboard you don't own?" had no good answer.

Matching the product to what it can honestly do also fixes the revenue
question. A directory is paid for by the side that wants to be found.

**What changed.**
- `Reservation` model, both reservation APIs, the booking modal, the user
  "my bookings" tab and the admin reservations panel: removed
  (migration `20260902113000_drop_reservations_add_listing_plan`).
- The buyer's path is now: search → compare → open the media → reveal the
  owner's phone (signed-in only) → deal offline. Every page that promised
  "رزرو آنلاین" was reworded.
- The seller's path became the product: submit media → admin review → publish.
- `Billboard.submittedById` links a listing to the account that sent it, which
  is what the user dashboard now shows.

**Where the concurrency work went.** The reservation code carried the strongest
concurrency guards in the project. They were not dropped — they moved to
`POST /api/listings`, which is now the non-idempotent write:

| Guard | On reservations (old) | On listings (now) |
|-------|----------------------|-------------------|
| `Idempotency-Key` | opt-in header, replays the stored response | same |
| DB unique constraint | `(billboardId, userId, startDate, endDate)` | **partial** unique index on `(submittedById, name, city)` `WHERE source='listing'` |
| Race test | 10 concurrent identical requests → exactly one row | same test, same assertion |
| Single-shot transition | — | approve/reject accepted once, 409 on a repeat |

The index is partial because scraped and admin-created rows may legitimately
repeat a name in a city. Prisma cannot express a `WHERE` clause on an index, so
it lives in raw migration SQL — and `test/reset-db.mjs` builds the test database
with `prisma migrate deploy` rather than `db push`, because `db push` works from
`schema.prisma` alone and would have produced a test DB silently missing the
very constraint the race test exists to prove.

Only the date-overlap logic itself is gone, because nothing overlaps any more.

---

## 18. Monetisation without a payment gateway

**Decision.** Two plans (`free`, `featured`). A paid plan does not go through a
gateway: the listing is parked in `awaiting_payment` and an admin confirms the
transfer by hand, which publishes it and grants the promotion.

**Why.** Every Iranian payment gateway needs a registered business, a contract
and a fee — outside what a capstone can obtain, and against the project's rule
against paid or region-blocked services. The two alternatives were a *simulated*
checkout screen or an honest manual step. A fake gateway would be the same
defect as the fake scraper panel this review removed: a UI that claims work
nobody does. The manual step is a real state machine, it is auditable, and
swapping in a gateway later means replacing one admin action with a webhook —
no schema change.

**Implementation.**
- `Billboard.plan` records what the submitter asked for; `Billboard.featured`
  records what an admin granted. Keeping them apart is the point: choosing the
  paid plan can never promote a listing on its own.
- `POST /api/admin/listings/[id]/decision` is the only place the transition
  runs, refuses a row that was already decided (409), and writes
  `listing_approved` / `listing_rejected` to the durable audit log.
- `featured` is the first key of every catalogue sort, so the promotion is a
  real, visible thing and not a badge with no effect.

---

## 19. Accepting file uploads from the public

**Decision.** Listing photos are accepted (≤5, ≤2 MB each), validated by the
file's own magic bytes, and stored under an unguessable path. The listing stays
unpublished until an admin has seen them.

**Why.** The listing form had an upload step that collected up to five photos
and then silently discarded them — the request never carried them. Making it
real means taking files from unauthenticated-by-default strangers, so nothing
the client says about a file is trusted:

| Claim | Why it is not trusted |
|-------|----------------------|
| declared MIME (`data:image/png`) | checked against the actual header bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47…`, WEBP `RIFF…WEBP`); a mismatch is rejected |
| file extension | never used — derived from the detected type |
| file name | never used — the server generates it, so no traversal, no null byte, no overwrite |
| declared size | capped after decoding, on the real byte count |

**What this does not do.** It is not a virus scanner. A structurally valid JPEG
can still target a decoder bug. The mitigations that matter here are that
uploads are served as inert static files with `X-Content-Type-Options: nosniff`
and are never executed, that SVG (which can carry script) is not accepted, and
that a human approves the listing before anyone else sees it.

`lib/uploads.ts` holds this once; both the public listing route and the admin
image manager call it, so the two cannot drift apart.

---

## 20. Anti-scraping: raising the cost, not claiming immunity

**Decision.** Bot user agents, per-IP budgets on the catalogue *pages* as well
as the API, hotlink protection on media, a 48-row page cap, and no bulk
endpoint. Search engines stay allowed.

**Why the honest framing matters.** A public website cannot be made
scrape-proof: anything a browser renders, a headless browser with a normal user
agent can extract. Claiming otherwise in a defense invites the obvious
follow-up — this project's own dataset was built by scraping other sites. What
is defensible is removing the *cheap* paths and making the expensive one slow:

- `/api/billboards/pins` returned every geocoded record — around 2 000 rows with
  name, slug, coordinates and price — in one cacheable request. It was the best
  scraping target on the site and had **no consumer**: the map it was built for
  no longer exists (the detail page uses a Google iframe). Deleted, along with
  the unused `leaflet` dependencies.
- `limit` fell from 100 to 48, so a full copy needs ~74 requests instead of ~36,
  against a 60/min budget.
- The catalogue HTML pages now carry their own 90/min per-IP budget; limiting
  only the API would have left the cheaper door open.
- The owner's phone — the commercially valuable field — is behind a session and
  never in a public payload.
- The user-agent blocklist is a speed bump, not a wall, and is documented as
  such. The rate limits are what actually cost an attacker something.

**A bug this created, and the rule it taught.** The hotlink check compared the
Referer's host against `req.nextUrl.host`. Under `next start` that is the
server's own bind hostname — `localhost:3000` — whatever host the client
actually asked for. So every visitor who did not type "localhost" was sending a
perfectly same-origin Referer that failed the comparison and got **403 on every
photo**: a phone on the same Wi-Fi saw a site with no images at all, and a real
deployment behind a domain would have done the same. The laptop looked fine,
which is exactly why it survived review for a while.

The fix is to compare against the host the *browser* used — `X-Forwarded-Host`,
else `Host` — never a value the framework derived. Three tests now pin it: a
same-origin Referer under a non-localhost host is allowed, a foreign Referer is
refused, and a missing Referer is allowed. The general rule: **an origin check
must read the origin the client asserted, not one the server reconstructed.**

**The tension.** Every measure above trades away discoverability. Googlebot and
friends are explicitly exempted and the sitemap is kept, because a marketplace
nobody can find is worse than one that can be copied slowly.

---

### 20a. Revision — the page-view limit was the wrong tool

The first version of §20 put a per-IP budget on catalogue *pages*: 90 a minute,
then a five-minute lockout. Testing on a real phone showed it was wrong in both
directions.

It did not stop a scraper. Anyone serious rotates addresses, and the thing worth
protecting — the owner's phone number — is behind a session and never appears in
a page's HTML at all. The pages it guarded carry what the paginated API already
serves, capped at 48 records a call.

It did stop people. Several visitors behind one NAT — a university, an office,
a demo where a reviewer, a phone and a laptop all browse at once — share a
single address and spend one budget between them. A person who reloaded a few
times was refused, which no ordinary site does, and the five-minute lockout cost
far more than the minute it was measuring. Every retry re-armed it.

The limit was removed, and the read limits behind it were re-cut: public reads
600/min, signed-in reads 300/min, admin panel 600/min, and **no lockout on any
of them** — a read endpoint that punishes past the window it measures turns a
burst of curiosity into a broken site. Auth and write limits are untouched:
login 5 per 15 minutes, registration 5 an hour, OTP 3 per 10 minutes, each with
its lockout. That is where a limit earns its cost.

What still guards the data costs a human nothing: the 48-record page cap, the
owner phone behind a session, hotlink protection on the media, bot user-agent
blocking, and the write/auth limits above. `okhttp` came off the blocked-agent
list — it is the HTTP client inside many Android apps, so a reviewer opening the
demo link from a messaging app would have hit a 403 with no explanation.

Verified after the change: 700 consecutive requests across the detail page, the
catalogue, the public API and the landing page — zero refusals; a scraper agent
still 403, a foreign hotlink still 403, `limit=100` still 400, the admin API
still 401, and the login lockout still fires on the eleventh wrong password.

---

### 14a. One SQLite connection per process, in every mode

`lib/db/client.ts` cached its Prisma client on `globalThis` only when
`NODE_ENV !== "production"`. The comment explained why — dev hot-reloads modules
and would otherwise open a connection per reload — and stopped there.

Production needed it for a different reason. Next splits server code into
chunks, and a page rendered on the server and a route handler beside it live in
different ones, so the module was instantiated more than once and each copy
opened its own connection to the same file.

With WAL that is not merely wasteful, it is wrong. Two connections, one
checkpointing the write-ahead log while the other is part-way through a read,
return `SQLITE_IOERR_SHORT_READ`: the detail page answers 500 while the API
beside it, on the other connection, is fine.

It surfaced under a test run that read and wrote hard at the same time — four
extra tests were enough — and the same shape is what a demo with several people
browsing while an administrator approves a listing looks like. Caching the
client unconditionally fixed it: ten I/O errors per suite run became zero.

Worth keeping in mind as a class: a guard written for one environment, with the
reason recorded for that environment only, is a guard nobody re-examines when a
second reason appears.

---

## 21. Denormalising the two sort keys

**Decision.** `Billboard.estimatedViews` and `Billboard.area` are stored
columns, copied from `traffic.estimatedViews` and from `width × height`.

**Why.** The catalogue offers «بیشترین بازدید» and «بزرگترین سطح». Neither was
sorting on what its label promised: `traffic_desc` ordered by `rating` (a
seeded, largely synthetic number) and `area_desc` ordered by `width` alone, so a
14×4 board (56 m²) outranked an 8×12 one (96 m²). Both were wrong answers, not
approximations.

The correct value lives in a JSON column and in an arithmetic expression, and
Prisma can express neither in `ORDER BY` — SQLite can read a JSON path with
`json_extract`, but no index can cover it and the ORM cannot emit it. The
standard answer is to materialise the sort key. `estimatedViews` is immutable in
practice (only the seed writes traffic); `area` is not, so `updateBillboard()`
recomputes it whenever width or height changes.

---

## 22. Running the demo: `next start`, never `next dev`

> **This section must survive into the thesis document.** It is the one
> operational rule the author keeps forgetting, and it is measurable, so it
> defends well.

The demo runs on the author's own fanless MacBook Air, not a rented server.
Browsing the site while `next dev` was running made the laptop hot enough to be
distracting. The cause is not the application — it is the development server.

Measured on this project, cost of a first visit to ten routes:

| Mode | CPU consumed |
|------|--------------|
| `npm run dev` | **9.7 s** |
| `npm run demo` (`next build && next start`) | **0.1 s** |

**~97× less CPU.** Idle, the production server costs 0.16 s of CPU per 10 s and
holds 121 MB RSS.

`next dev` keeps the Turbopack compiler resident and builds each route from
scratch the first time it is requested — so *clicking around* is exactly the
worst-case workload. It also watches all 6710 project files (4173 of them in
`public/`) for hot-reload, ships React unminified with every development
warning, and double-renders components under strict mode. `next build` pays all
of that once, ahead of time.

`npm run demo` was added to `package.json` so the correct command is a single
word and there is nothing to remember or get wrong. `next dev` remains the right
tool while writing code — its cost buys hot-reload, which a demo does not need.

**The four commands, and how they relate.** "build" is a *step*, not a run
mode; the production mode is `next start` and there is nothing else to it.

| Command | Next equivalent | What it does | Serves the site? | When to use |
|---------|-----------------|--------------|------------------|-------------|
| `npm run dev` | `next dev` | Dev server: compiles each route from scratch on first request, watches 6710 files, hot-reload | yes | **only** while writing code |
| `npm run build` | `next build` | Compiles into `.next/`, then exits to the shell | no | once before `start`; or to confirm a clean build |
| `npm run start` | `next start` | Serves the site from an existing build — **this is production mode** | yes | real runs; boots in ~1 s if `.next/` already exists |
| `npm run demo` | `next build && next start` | the two above, back to back | yes | simplest path; after any code change |

`start` and `demo` are identical in cost — both run `next start`; the only
difference is whether a build runs first. So: `npm run demo` on the first run or
after changing code (~15 s, build included), `npm run start` on later runs
without code changes (~1 s).

### 22a. Image weight: PNG was the wrong container for photographs

The scrapers saved listing photos as PNG. PNG is lossless and meant for
graphics; for a 500×500 photograph it costs roughly 7× the bytes of a visually
identical JPEG. The result was 1563 PNGs totalling **565 MB**, and **4.0 MB of
image bytes on a single 24-card `/explore` page** — paid twice, once on the wire
and once in the browser's image decoder, which is the other half of the heat.

`scripts/optimize-images.py` re-encodes them offline with Pillow (no network, no
external service — a hard constraint in Iran). Three rules keep it lossless in
every way a user can perceive:

1. **Dimensions never change.** Only the container changes, so the detail-page
   lightbox is pixel-for-pixel as large as before.
2. **PNGs that actually use transparency are left alone.** JPEG has no alpha
   channel. Of 1563 files, 1332 had a fully-opaque alpha channel and were
   converted; the 231 with real transparency stayed PNG.
3. **References are rewritten from an explicit per-file map**, not a blanket
   `.png` → `.jpg` replace, so the surviving PNGs keep resolving. Both the DB
   rows and the seed JSON are updated, so re-seeding cannot reintroduce the old
   paths.

Result: **493 MB → 64 MB (87% smaller)** at quality 85, measured pixel RMSE 2.37
of 255 — below the threshold of perception. One `/explore` page went from
**4.0 MB to 1.09 MB**. Deletion of the superseded originals is a separate
`--delete-originals` run, so the migration stays reversible until verified.

Alongside this, `loading="lazy"` + `decoding="async"` were added to every
thumbnail (grids, carousels, admin panels) so a page decodes only the images
actually on screen, and decoding happens off the main thread. The detail page's
primary image stays eager — it is the LCP element.

So the fix does not regress on the next scrape, the same rule runs at download
time: `scraper/image_utils.py::save_optimized()` re-encodes an opaque PNG to
JPEG as it is written, and `existing_variant()` lets a re-run recognise a file
it already has under either extension. All three scrapers plus the two
`fix_*_images.py` repair scripts go through it. The one-off
`scripts/optimize-images.py` remains for the assets scraped before this.

### 22b. The rule applied to the test suite — and the bug it uncovered

`npm test` used to start `next dev`. The consequence was the same 97x, paid 113
times over, and it eventually stopped being merely slow: one test reads the
catalogue 120 times in a row to prove that reading is *not* rate limited the
way writing is. Under `next dev` those reads were slow enough that a single
request passed undici's 300-second header timeout. `fetch` threw
`UND_ERR_HEADERS_TIMEOUT`, the server was wedged, and the remaining ~20 tests
failed in a wall of milliseconds-long errors that had nothing to do with the
code they named. A suite that fails for the wrong reason is worse than no
suite: the author had learned to distrust its tail.

Building once and serving with `next start` fixed it outright.

| | `next dev` | `next build` + `next start` |
|---|---|---|
| Wall clock, whole suite | >20 min, never finished | **35.6 s** (16.3 s of tests) |
| Result | 20+ cascading failures | 113 tests, all passing |

Three details keep it honest. The build goes to `.next-test/` (a `distDir`
override in `next.config.ts`) so a test run never replaces the `.next` that
`npm run demo` is serving — losing the demo build to a test run, minutes before
a defense, is a failure mode worth designing out. `test/helpers.mjs` aborts any
single request after 30 seconds, so a stall reports itself in seconds instead
of inheriting a five-minute default and burying its cause. And the suite now
exercises the artifact that actually ships rather than a development build.

That last point immediately earned itself. The password-reset test had been
reading the one-time code out of the response body, which the route echoes when
`OTP_DEV_ECHO=1` — an affordance also gated on `NODE_ENV !== "production"` so
it can never arm on a real deployment. Against a production build the echo is
correctly absent, and the test failed. The tempting fix was to drop the
`NODE_ENV` half of the guard; that would have traded a real security property
for test convenience. Instead `helpers.recoverOtpCode()` reads the issued row
and walks the six-digit space against the stored HMAC (one second at worst),
so the test proves the flow using only what a real client would ever receive.
The neighbouring "unknown phone reveals nothing" test had been asserting that a
field was absent — vacuously true once the echo was off — and now asserts that
no code row was created at all.

The guard survived because the test was made stronger, not because the code
was made weaker. This is the whole argument for testing against the build that
ships: a development-only convenience is exactly the kind of thing that hides a
production difference until the day it matters.

---

### 22c. `next/image` without an image server

**The gap.** `next/image` was used nowhere: seventeen raw `<img>` tags. That
means no `srcset` — a phone downloads whatever a desktop downloads — and no
stated dimensions, so every image shifted the layout as it arrived. Layout
shift is one of the three metrics Google actually ranks on.

**The catch, and why the obvious fix was the wrong one.** `next/image` resizes
on demand through `/_next/image`. That is real CPU on the machine serving the
page — the one thing §22 exists to avoid, on a fanless laptop that a reviewer
will be browsing from a phone. Adopting the component the usual way would have
traded a client-side problem for a server-side one.

So: a custom loader (`image-loader.js`) and pre-built files
(`scripts/build-image-variants.py`, `npm run images:variants`). The loader does
no work — it maps a requested width to a file that already exists on disk. The
`/_next/image` endpoint is never reached; a check for it in the served HTML
returns zero.

**Half the premise was wrong, and measuring said so first.** The plan assumed
phones were being handed oversized desktop images. Every one of the 4,165
scraped images is **exactly 500×500**. There is nothing to downscale for a
high-density phone, which wants 500 or more for a full-width card and gets
exactly that. The saving is real only where the display box is genuinely
smaller than the source — an 88-pixel list thumbnail, a 230-pixel related card,
and any 1× display. Two variants, 256 and 384, cover all of those.

**The weight was somewhere else entirely.** The landing page shipped 1,918 KB of
images, and **1,585 KB of it was five PNG files**. The 231 PNGs left alone by
§22a — correctly, since all 231 carry real transparency — average 298 KB each
against 50 KB for the JPEGs: 26% of the image bytes in 5.5% of the files. WebP
keeps the alpha channel at about 26 KB a picture. So a PNG gets a third variant
at its own 500 pixels: not a resize, a re-container. It is the only rung that
helps a 2× phone, because a 2× phone was already asking for 500.

**Measured, per device, by resolving each `srcset` the way a browser does
(`npm run images:check`):**

| page | before | phone 390px @2× | laptop 1440px @1× |
|---|---|---|---|
| landing | 1918 KB | **475 KB** | **292 KB** |
| catalogue, grid | 1155 KB | 1155 KB | **671 KB** |
| catalogue, list | 1155 KB | **384 KB** | **365 KB** |
| media detail | 640 KB | 640 KB | **209 KB** |

Layout shift is gone everywhere: every image either states its own box or fills
a parent that already reserves one.

**What it costs.** Two production builds, alternating, 250 measured visits each:
`/explore` went from **10.30 to 10.70 ms** of server CPU. The extra 0.4 ms is
the `srcset` attributes in the HTML — 4 KB more markup, which is §26's rule
showing up again on the other side of the ledger. Four tenths of a millisecond
for between 42% and 75% fewer image bytes is not a close call.

**The operational catch, written down because it will bite someone.** The
variants live under `public/images/scraped/`, which is git-ignored along with
the images themselves. A fresh clone has none of them and the loader will point
at files that are not there. `npm run images:variants` builds what is missing
(95 seconds from cold, seconds thereafter) and `npm run images:check` proves
every image every page asks for actually resolves. Both are in the pre-deploy
checklist in `RUNBOOK.md`.

**One accepted limit.** A PNG-sourced image is served only as WebP. Every
browser since Safari 14 (2020) reads it; anything older sees a broken image on
5.5% of the catalogue. Given the demo runs on current mobile Chrome, that is a
trade worth taking rather than shipping both formats.

---

## 23. A CRM, evaluated — and why the answer was 40 lines of schema, not a second application

The question that started this was concrete: *Atomic CRM* (Marmelab, MIT) is a
well-regarded open-source CRM on GitHub — should Rasamap adopt it?

**It was rejected, on the stack, not on the quality.** Atomic CRM is a Vite SPA
whose backend is **Supabase** (Postgres + GoTrue auth + storage + edge
functions). Adopting it means one of two things: a Supabase account — a hosted
SaaS this project has ruled out on principle and cannot reach from Iran without
a workaround — or a self-hosted Supabase stack under Docker, on the fanless
laptop that also has to run the demo (§22). Either way it is a *second*
application, with a second database, a second auth system, an English LTR
react-admin UI against this project's Persian RTL and inline-style rule, and a
domain model of contacts / companies / **deals** that knows nothing about
billboards. The integration cost is not the CRM; it is owning two systems.

**Then the more useful question: does the product actually need one?** Three
things a CRM does, checked against what is already here:

| CRM capability | Rasamap |
|---|---|
| Deal pipeline | **Not applicable.** There is no booking and no deal to track — Rasamap is a directory, not a broker (§17). |
| Approval workflow with an audit trail | **Already built.** `pending → awaiting_payment → published`, admin-decided, `listing_approved` in the audit log. |
| Lead capture | **Missing.** This was the real gap. |

The gap was specific. Handing over the owner's phone number is the last thing
the platform can observe — after that the conversation leaves the site. That
reveal was a `GET` that recorded nothing, so the product had no record that
demand had ever happened: which media attract interest, from whom, how often.
For a marketplace, that is the one number worth knowing.

**What was built instead (the equivalent, in-stack):**

- `contact_requests` — one row per (media, account), unique index on the pair.
  A repeat reveal is the *same* lead, so it increments an atomic `count` and
  moves `lastRequestedAt` rather than inserting a second row (§8: duplicates are
  defined at the DB level, and `increment` is one `UPDATE`, so two simultaneous
  clicks cannot both read 1 and both write 2). A first-click race that trips the
  unique index is caught as `P2002` and retried as the increment.
- `GET → POST /api/billboards/[slug]/contact`. The verb change is the point: the
  number used to be fetched on mount, so a `GET` recorded page renders, not
  interest. It is now behind an explicit **«نمایش شمارهٔ تماس»** button, and the
  GET was removed rather than left alongside — a second, unrecorded path to the
  same number would make the record meaningless.
- `GET /api/admin/leads` + `PATCH /api/admin/leads/[id]` and a **سرنخ‌ها** tab:
  the follow-up states `new → contacted → closed`, plus an internal memo. That
  is the CRM part, and it is deliberately the whole CRM part.
- The lead write cannot cost a user the number they asked for: it is wrapped so
  a failure is logged and the phone still returns. Bookkeeping does not get to
  break the product.

**What is knowingly given up** versus a real CRM: no companies, no email
capture, no kanban, no reminders, no import/export, no per-owner portal. None of
them has a user in a directory with one admin. The honest framing for a defense
is that a CRM is a *sales* tool, and Rasamap does not have a sales process — it
has a demand signal, and now it records it.

**Privacy.** The row stores who asked about what, so the terms page says so in
plain Persian, the admin memo is marked internal and never shown to the user,
and the audit entry for a status change carries ids only — no name, no phone
(the logger's standing rule).

---

## 24. One bug class: "works on the developer's machine"

Opening the finished site on a phone on the same Wi-Fi turned up a family of
faults that had been invisible for months, because every one of them is masked
by the two things a developer's browser does differently: it visits
`localhost`, and it visits over the machine's own loopback.

| Symptom on a phone | Cause | Why the laptop never showed it |
|---|---|---|
| No photo loads anywhere | Hotlink guard compared the Referer against `req.nextUrl.host`, which under `next start` is the server's bind hostname | On the laptop the host really *is* `localhost`, so the comparison passed |
| Carousel shows empty cards | `loading="lazy"` on photos moved by `translateX` inside `overflow:hidden` — never in the viewport, never fetched | Desktop Chrome uses a far larger lazy pre-load distance |
| Map appears only after a reload | `loading="lazy"` on the map iframe, just below the fold | A reload restores the scroll position, which puts the frame in view at parse time |
| Login succeeds, then the user is logged out | The session cookie carried `Secure`, keyed off `NODE_ENV === "production"`, which `next start` sets — and a browser discards a `Secure` cookie that arrives over HTTP | Chrome treats `http://localhost` as a trustworthy origin and keeps the cookie |
| Share button does nothing at all | `navigator.share` and `navigator.clipboard` exist only in a secure context; the code called `clipboard.writeText` unguarded and it threw | `localhost` *is* a secure context |
| Social previews point at localhost | Two env names for one idea — `NEXT_PUBLIC_BASE_URL` in the sitemap, `NEXT_PUBLIC_SITE_URL` in `metadataBase` — neither set, with different fallbacks | The developer is the one person for whom `http://localhost:3000` resolves |

**The single rule underneath all six:** *never infer a property of the
connection from the environment the code was built for.* Whether the request is
secure, which host the client used, how far the viewport reaches — these are
facts about **this** request, and every one of them is available on the request
itself. `NODE_ENV`, `nextUrl.host` and "it looked fine when I scrolled" are
substitutes that agree with reality only on the machine that wrote the code.

Concretely: `Secure` is now set from `x-forwarded-proto` / the request
protocol; the hotlink check reads `X-Forwarded-Host` / `Host`; the two base-URL
variables became one (`lib/site-url.ts`); clipboard access goes through
`lib/clipboard.ts`, which falls back to `execCommand` and reports honestly
whether it worked; and `loading="lazy"` was removed from the two places where
the element can never enter the viewport on its own, and deliberately kept
everywhere the user scrolls vertically.

Five regression tests pin the two that are testable from the API: the cookie's
flags with and without `x-forwarded-proto`, and the hotlink guard under a
non-localhost host, from a foreign site, and with no Referer at all.

**Making it stick.** Prose alone does not stop the next contributor — or the next
agent — from writing the same line again, so the rule is enforced two ways.
`AGENTS.md` rule 9 states it with the banned form beside the correct one, and
five *source guards* in the test suite fail the build when the pattern
reappears: a cookie `Secure` flag keyed off `NODE_ENV`, an origin check against
`req.nextUrl.host`, a bare `navigator.clipboard`, a lazily loaded `<iframe>`,
and an infinite marquee missing from the `html.page-hidden` pause list. They
were verified the only way a guard can be: by putting one of the bugs back and
watching the suite go red.

**Worth saying in a defense:** the class matters more than the six instances.
A local development environment is not a small version of production — it is a
*different* environment, and the differences cluster exactly where security
decisions are made (origin, transport, secure context). Testing on a second
device on the same network found in one evening what months of local work had
not.

---

## 25. Where the cache lives — and why Redis is written but switched off

**The question.** The server keeps what it has already worked out: the rendered
landing page, and every catalogue query behind `/explore` and each media page.
Today that store is a directory inside `.next/cache`. Should it be Redis?

**Why it matters, and it is not speed.** One process on one laptop is served
perfectly well by a directory. Three things break the moment there is a second
instance, and all three are correctness rather than performance:

1. An entry built by instance A is invisible to B, so the same work is done
   once per instance instead of once.
2. A redeploy throws the whole cache away and every instance starts cold at the
   same moment — the worst possible time.
3. The one that actually misleads someone: an admin approving a listing calls
   `revalidateCatalogue()`, which clears the cache **on the instance that
   handled the request**. Every other instance keeps serving the old catalogue
   until its copy expires on its own. The admin sees the change, refreshes, sees
   it again, and has no way to know that half the visitors do not.

**What was built.** `cache-handler.js` implements Next's cache-handler interface
over Redis, and `next.config.ts` names it only when `REDIS_URL` is set. With the
variable empty, nothing in the file is loaded and Next uses its own directory —
the same *built, tested, dormant* shape as the SMS layer in §16. Switching it on
is an environment variable, not a code change.

**The measurement that changed the design.** The first version put every read
through Redis, as the documentation's example does. On the demo laptop, over
loopback, that made the landing page go from **1.9 ms to 6.2 ms of CPU per
visit** — a shared cache three times slower than the directory it replaced,
because a page that used to be handed over from memory now costs a round-trip.
A foundation that is a 3× regression on the hot path is not a foundation.

So the handler keeps a bounded in-memory tier per process in front of Redis, and
publishes every tag invalidation on a Redis channel that all instances
subscribe to. The memory tier answers the read; the channel is what keeps it
honest. That brings the landing page to **3.4 ms** while preserving the
cross-instance behaviour the single-tier version was buying at that price.
Verified with two processes: B calls `revalidateTag`, and A's own memory misses
on the next read.

If Redis is unreachable the handler logs once — not once per request — and
returns null, so pages render uncached. A cache that fails should cost latency,
never availability.

**The honest recommendation.** Leave `REDIS_URL` empty until there really is a
second instance. On one machine it is measurably slower, and the problems it
solves do not exist yet. It is here so that the day the answer changes, the
work is already done and already measured.

---

## 26. Caching the render, evaluated — and reverted

**The idea.** §22 and V1 established that `/explore` costs about 10 ms of server
CPU per visit, of which the database is roughly 8 and is already cached away.
What remains is React laying out twenty-four cards. Next.js 16 can cache that
too: `cacheComponents: true` plus the `use cache` directive stores the rendered
output, not just the query. On paper it should take `/explore` to about 2 ms,
the way the landing page already is.

**It was built, not just considered.** The flag was enabled, the two
`export const revalidate` declarations were migrated to `cacheLife`, `usePathname`
in `StaffBar` and the request-time work on the media page were wrapped in
Suspense boundaries, `lib/db/cached.ts` was converted from `unstable_cache` to
`use cache`, and the catalogue was restructured so the rendered result of one
set of filters became a cache entry keyed by those filters. The build passed and
both routes became Partial Prerender.

**The measurement.** Two production builds, alternating, each run alone with a
60-request warm-up and 250 measured visits:

| | without Cache Components | with Cache Components |
|---|---|---|
| `/explore` | 10.24 ms | 10.32 ms |
| `/billboard/[slug]` | 13.92 ms | 14.52 ms |
| `/` | 1.95 ms | 2.05 ms |

Nothing. Slightly worse, in fact, on both dynamic routes.

**Why — the part worth keeping.** Caching a React tree does not cache the
*response*. On a cache hit Next still has to turn that tree into HTML bytes and
stream them, and for a page whose output is 165 KB that serialisation is the
cost. It is why the landing page is fast and these two are not: `/` is
prerendered to a file at build time and served as bytes, with no per-request
React work at all. The lesson generalises past this framework — **the cost of a
server-rendered page tracks the size of what it emits, not the work behind it.**

**Why it was reverted rather than kept as a neutral change.** It was not
neutral. `use cache` reads a different handler interface — `cacheHandlers`,
plural — than `cache-handler.js` implements, so adopting it would have left the
catalogue cache unshareable and undone §25. It also makes every future page
carry a Suspense obligation the compiler enforces at build time. Paying that for
zero measured gain is a bad trade.

**What was kept from the attempt,** because it stood on its own: the media page
now reads its record and its "related media" through the cache instead of
querying on every visit, `getRelatedBillboards()` takes the three fields it
matches on rather than a whole record so it can be keyed sensibly, and
`/api-docs` no longer re-reads and re-renders `docs/api.md` from disk per
request.

**If this is revisited,** the lever is not caching more — it is emitting less,
or emitting it once. Prerendering the most-visited media pages with
`generateStaticParams` would move them into the same class as `/`, which is the
only thing measured so far that actually works.

---

## 27. PostgreSQL, ready but not connected

**The position.** The project runs on SQLite, and §14 argues why that is the
right answer for one process on one laptop with a catalogue of 3,532 rows. The
limitation the thesis states honestly is that it is one instance. This section
is about closing the distance between "we know how we would move" and "we have
moved and moved back", without actually moving.

**What was made possible.** The engine is now read from the connection string
and nothing else (`lib/db/engine.ts`). `file:` selects the SQLite adapter,
`postgresql:` the PostgreSQL one, and an unrecognised scheme is an error rather
than a default — a typo that silently opened an empty SQLite file next to the
app would look exactly like data loss. The PostgreSQL adapter is required
lazily, so the SQLite path never loads it.

**Two places the engines actually differ, both now handled.**

1. *Reading inside JSON.* `totalDailyReach` sums `traffic.daily`, which lives in
   a JSON column, and the two engines spell that differently —
   `json_extract(traffic, '$.daily')` against `(traffic ->> 'daily')::bigint`.
   Only the fragment is chosen by engine; the query around it is shared.
2. *Case in `contains`.* SQLite's `LIKE` ignores case for ASCII, PostgreSQL's
   does not. A search for `billboardiha` finds `Billboardiha` today and would
   have quietly stopped after a migration — not an error, just fewer results.
   The PostgreSQL path asks for `mode: "insensitive"` so the two behave the
   same. Persian has no case; this matters for the Latin agency names.

**The move itself is one command.** `npm run db:to-postgres -- <url>` reads
every table out of SQLite, points the schema at PostgreSQL, creates the tables,
copies parents before children in batches, advances each id sequence past the
highest copied id, and then counts both sides and refuses to report success
unless every table matches. Any failure puts the schema file back on SQLite
before exiting. The SQLite database is only ever read, so it remains the
rollback — `npm run db:to-sqlite` returns the schema and the generated client.

**Two things learned by running it rather than reasoning about it.**

- *It has to be two processes.* The generated Prisma client is built for one
  provider, and regenerating it on disk does not change the copy already
  imported into a running process. A single-process version reads SQLite fine
  and then fails at the first insert with "adapter based on postgres is not
  compatible with the provider sqlite". The parent now dumps and re-points; a
  child, started afterwards, writes.
- *The id sequences have to be advanced.* SQLite's ids came from the seed and
  were deliberately preserved. PostgreSQL keeps a counter per table, and a fresh
  counter still at 1 makes the very next insert collide with row number one —
  a unique-constraint error on a table with obvious room in it.

**Verified end to end, not asserted.** Against a PostgreSQL 16 container:
3,562 rows moved with every table's count matching on both sides, then the
application was built and served against it. The same questions to both engines
returned identical answers — 3,532 published media, 101 cities, a daily reach of
204,018,788, the same four type counts, 2,781 results for `billboardiha` in
either capitalisation, and 24 rendered prices on `/explore`. The partial unique
index was confirmed present on the target with its `WHERE` clause intact. Then the schema was
switched back and `npm test` returned 113/113 on SQLite.

**Still on SQLite on purpose.** Nothing about the running project changed:
`DATABASE_URL` is still a file, `prisma/schema.prisma` still says `sqlite`, and
the demo still needs no service running beside it. The dormant-by-default shape
is the same one used for SMS (§16) and the shared cache (§25) — the work is
done and measured, and switching is a decision rather than a project.

**The one thing `db push` does not carry across.** A schema file cannot express
a partial index — Prisma has no way to put a `WHERE` clause on one — so the
unique index that stops a listing being submitted twice lives in migration SQL
instead. A database built from `schema.prisma` alone silently lacks it, and
"silently" is the problem: the symptom is duplicate rows nobody notices until
someone looks. `test/reset-db.mjs` already runs `migrate deploy` rather than
`db push` for exactly this reason. The migration script now creates it
explicitly after pushing, and verifies it is there before reporting success. If
another index of this kind is ever added, it has to be added to that list too —
the script says so at the definition.

**What is deliberately not done.** `prisma/migrations/` holds SQLite SQL. The
PostgreSQL side is created with `db push` from the same schema plus the explicit
index above, rather than a parallel migration history, because keeping two
histories in step by hand is a worse failure mode than regenerating one. If
PostgreSQL ever becomes the primary engine, the migration history should be
regenerated against it once, and this paragraph deleted.

---

## 28. The deployment surface, prepared and mostly proven

The one sentence the thesis prints in red is "not deployed". Closing it needs a
domain and a rented machine, which is a purchase rather than a piece of work.
What could be done was everything on this side of that purchase, so that the
remaining part is copying commands rather than making decisions.

**`/api/health`.** A liveness check that returns a constant answers the easy
question. The failure worth catching is the other one — Node accepting
connections while every page behind it is a 500 — so the endpoint runs
`SELECT 1` and answers 503 if the database is unreachable. The body is bare
`{"status":"ok"}` on purpose: this is a public URL, and an unauthenticated
endpoint that reports the engine, the version or the uptime hands a fingerprint
to anyone who asks. The reason for a failure goes to the log. It is also the one
route that does not go through `withApiLog` — polled every few seconds, it would
bury the requests that matter under thousands of daily lines of "still fine".

**A trap that would have cost an afternoon on deployment day.** The first live
call returned **403**. `proxy.ts` blocks bot user agents on `/api/*`, and every
monitor there is identifies itself as `curl`, `Go-http-client`, `kube-probe`, or
nothing at all. A liveness check that only answers browsers reports the site as
down from the moment it is deployed — and the obvious diagnosis would have been
"the app is broken", not "the bot filter is working". `/api/health` is now
exempt, before any other rule runs. It returns a status and no data, so the
exemption gives a scraper nothing; the catalogue still 403s for `curl`, and a
test holds both halves in place.

**The backup script had gone quietly wrong.** §27 made the engine a matter of
`DATABASE_URL`, and `backup-db.sh` still copied a SQLite file unconditionally.
On a PostgreSQL deployment it would have kept producing a healthy-looking
backup of a file that was no longer the database — worse than no backup,
because it looks like one. It now reads the same connection string
`lib/db/engine.ts` reads, uses `pg_dump` for PostgreSQL, and refuses an
unrecognised scheme instead of guessing. Both paths were exercised, and a
restore was rehearsed: `integrity_check = ok`, 3,536 media, 10 users.

**Templates rather than prose.** `deploy/` holds an nginx server block, a
systemd unit, and a backup timer, and `RUNBOOK.md` holds the order to apply
them in. The nginx file carries the part that matters and is easy to get wrong:
it must set `X-Forwarded-Proto`, `X-Forwarded-Host` and `X-Forwarded-For`, or
three apparently unrelated things break — the session cookie ships without
`Secure`, the origin check rejects legitimate form posts, and every visitor
lands in one rate-limit bucket. That is §24's bug class arriving exactly where
it was predicted to, so the reasons are written next to the directives.

**The acceptance test was run, without buying anything.** `npm run demo` plus
`cloudflared tunnel --url http://localhost:3000` puts the site on a real
`https://….trycloudflare.com` address: real TLS, a real reverse proxy, and a
host that is not `localhost`. That is precisely the environment §24 says this
class of bug only appears in, and it costs nothing and takes five minutes.

The result that matters is rule 9 finally verified against a real proxy rather
than reasoned about. One build, one process, two connections: the session cookie
came back with `Secure` over the tunnel and **without** it over
`http://localhost`. `isSecureRequest()` is reading `x-forwarded-proto`, not
guessing from `NODE_ENV`.

| checked remotely | result |
|---|---|
| eight public routes (landing, catalogue, detail, compare, login, health, robots, sitemap) | all 200 |
| login with a demo account, then `/api/auth/me` with that cookie | works — the session survives the proxy |
| cookie flags over HTTPS | `HttpOnly SameSite=Strict Secure` |
| cookie flags over `http://localhost` | the same, without `Secure` |
| hotlink protection: own referer / another site / no referer | 200 / 403 / 200 |
| `npm run images:check <public url>` | every image on every page resolves |
| price markers in `/explore` HTML | 24 — the catalogue is readable to a crawler |
| cross-origin state-changing POST with no cookie | 401, and `SameSite=Strict` means a browser would not send one |

**The one thing it surfaced.** `robots.txt` and `sitemap.xml` still advertised
`https://rasamap.ir`, because `NEXT_PUBLIC_BASE_URL` was unset and
`lib/site-url.ts` defaults to it. Not a bug — a documented default — but on any
other host it points crawlers at a domain that is not the one they are reading,
and nothing complains. It is the first variable to fill in on a new server, and
it is now in the pre-deploy checklist with that reason attached.

**What is still genuinely not done.** No domain and no rented host, so nothing
survives closing the laptop. Everything the site does once it is reachable has
now been exercised over a real proxy.

---

## 29. Tightening the Content-Security-Policy — and the one line left loose on purpose

**What was wrong.** The policy still allowed `unpkg.com` in `script-src`,
`unpkg.com` in `style-src`, and `api.neshan.org`, `*.tile.openstreetmap.org`,
`*.basemaps.cartocdn.com`, `*.neshan.org`, `map.ir` and `billboardiha.com`
across `img-src` and `connect-src`. Every one was left over from the Leaflet map
layer removed in §20. An allowed origin that nothing uses is not neutral: it is
a supply-chain hole that buys nothing, and a CDN in `script-src` is the worst
kind, because a compromise there executes as first-party code. Verified dead
before removing — no import, no fetch, no image URL, and no row in the database
with an off-site image. The policy now names only origins the app contacts: the
Google Maps frame on a media page, and itself.

`X-XSS-Protection: 1; mode=block` went too. It drove a filter every current
browser has removed, and in the browsers that did honour it the filter itself
introduced vulnerabilities — which is why the guidance is to send `0` or
nothing. The CSP is the control that does this job.

**`'unsafe-eval'` is gone, on evidence rather than hope.** A 200 from the server
proves nothing about whether a browser can run the page, so the check was made
against the shipped bundle instead: zero occurrences of `eval(` or
`new Function(` across every chunk in `.next/static/chunks`.

**`'unsafe-inline'` in `script-src` stays, and this is the decision worth
recording.** Removing it means a per-request nonce, and Next.js is explicit that
a nonce requires dynamic rendering — a prerendered page is built before any
request exists, so there is no nonce to inject.

Measured, two builds, alternating, 250 visits each:

| landing page | CPU per visit |
|---|---|
| prerendered (today) | **1.86 ms** |
| forced dynamic, as a nonce requires | **8.30 ms** |

Four and a half times the CPU on the most-visited page in the site, and it
would undo the prerendering V1 earned. Against what? `'unsafe-inline'` in
`script-src` matters when an attacker can get script into the page — and there
is nowhere to put it. React escapes everything it renders; the single
`dangerouslySetInnerHTML` in the codebase renders `docs/api.md`, a file shipped
with the build, through an escape pass first. There is no user-controlled HTML
anywhere in the application.

So: pay 4.5x on the hot path to harden a vector that does not exist, on a
fanless laptop whose CPU budget is the subject of §22. Declined, with the
numbers, the way §26 was. If user-generated HTML is ever introduced — a rich
description field, an embedded advert — this decision inverts and the nonce
becomes worth its cost. That is the trigger to watch for, not the calendar.

**One source for `robots.txt`.** There were two, `app/robots.ts` and
`public/robots.txt`, and a file in `public/` wins — so the rich rules lived in
the static one and the generated route was dead code waiting to go stale. The
generated route was kept rather than the file, for a reason that only appears on
deployment day: the static file hardcoded
`Sitemap: https://rasamap.ir/sitemap.xml`. Served from a staging host, a free
subdomain or the tunnel used to test from a phone, it pointed crawlers at a
domain that was not the one they were reading, and nothing would have reported
it. It now comes from `SITE_URL` — rule 9 again, in the one file where it had
been missed.

**A required environment variable that nothing required.** `NESHAN_API_KEY` was
documented as mandatory while the running application never reads it; only the
offline coordinate backfill does. A required variable with no reader is a
deployment that refuses to start for no reason. It is optional now, documented
as belonging to the maintenance script. `NEXT_PUBLIC_NESHAN_KEY` was genuinely
dead — there is no client-side map any more — and went with the warning that
promised "the map layer will be disabled", which had not been true since §20.

---

## 30. Being findable, and the two things Persian breaks on the way

V1 made the catalogue readable to a crawler. This is the rest of it: a title on
every page, a card when the link is shared, and structured data so a media page
can appear as a result with a photo and a price rather than a blue link.

**Seven pages had no title.** `about`, `contact`, `terms`, `analytics`,
`compare`, `reset-password` and `admin/login` all rendered under the root
layout's site-wide title. Five of them are client components, which cannot
export `metadata`, so each got the same tiny `layout.tsx` `/explore` already
used. Three are marked `robots: { index: false }` on purpose: a comparison tray
is built from what one visitor happened to pick, and a password reset and a
staff login are not content — indexing them puts a dead or private page in
front of someone who searched for media.

**The share card, and why it took three attempts.** `next/og` renders it, and
Persian broke it twice in ways only visible by looking at the output.

1. *No font.* Given none, the renderer fetches one from Google Fonts, which
   fails on a machine that cannot reach it and silently produces a card whose
   Persian is blank boxes — worse than no card. It also cannot read the woff2
   this project self-hosts, nor a variable axis. `scripts/build-og-fonts.py`
   pins the weight axis and writes two static TTFs from the same Vazirmatn that
   is already in `node_modules`.
2. *No bidirectional layout.* Satori shapes the glyphs correctly and then places
   the words left to right, so «بیلبوردهای ایران، یک‌جا و قابل جست‌وجو» came out
   with its words reversed. `dir="rtl"` does not fix it. A line is now laid out
   explicitly — one element per word in a `row-reverse` flex box.
3. *The same reversal one level down.* Persian joins parts of a word with a
   zero-width non-joiner, and «یک‌جا» became «جایک». Each word is now split on
   that character too and its parts reversed in place with no gap, which is
   exactly what the character means.

A media page keeps its own photograph as the card instead, which is better than
anything generated: the product is the picture.

**Structured data.** A media page now carries a `Product` with an `Offer` —
what it actually is: a thing with a price, rented by the month. The price
needed care. The catalogue stores millions of Toman (`price: 65` is 65 million
Toman a month) and schema.org wants ISO 4217, of which Toman is not one. Iran's
code is IRR and one Toman is ten Rial, hence a factor of ten million; publishing
`65` against `IRR` would have advertised a billboard for six Toman. `aggregateRating`
appears only when real reviews exist — a rating invented for the crawler is how
a site loses rich results altogether. The JSON is escaped at `<`, because a name
containing `</script>` would otherwise close the tag and turn catalogue data
into markup.

**The sitemap was already right, and now that is known rather than assumed.**
3,532 published rows in the database, 3,532 `/billboard/` URLs in the sitemap,
four static routes, and zero appearances of a slug that is still awaiting
review.

**A manifest, so the catalogue can live on a home screen.** `display: "standalone"`
matters more here than usual: the app is RTL and the address bar is the one
piece of UI that is not. The two PNG icons are drawn from the same coordinates
as `app/icon.svg` rather than by adding an SVG rasteriser to the toolchain for
two files.

---

## 31. Opening a browser: the gap the API tests could not see

**The gap the thesis already admitted.** 116 tests cover the API well and not
one of them opens a browser. Everything between "the server answered correctly"
and "the visitor saw the right thing" — hydration, a form that submits, a
Persian layout at phone width — was checked by hand and therefore checked once.

**No new dependency.** `npm i -D @playwright/test` failed on this machine
twice, and the browser download is ~150 MB besides. But Chrome is already
installed, and it speaks the DevTools protocol over a WebSocket, which is all a
test driver needs. `test/browser.mjs` is 359 lines: launch, navigate, wait,
fill, click, screenshot. It borrows the harness `npm test` already uses —
production build, isolated database, own port (§22b) — so `npm run test:e2e`
reseeds `prisma/e2e.db`, builds into `.next-e2e/`, serves on 3200 and runs
nine flows: catalogue and filter, unpublished rows staying hidden, sign-in,
a rejected sign-in, the two-step sign-up with its phone code (§16), the contact
number behind that sign-in, submitting a listing, the admin door refusing a
customer, and the catalogue at 390px.

**Failures write a screenshot,** and that is most of the value. "Expected a
card, found none" is nearly useless; a picture of what the browser actually had
on screen answered every question below in one look.

**What it found immediately.**

1. *A 403, before any test could run.* Headless Chrome announces itself as
   `HeadlessChrome/…`, which `proxy.ts` blocks along with selenium, puppeteer
   and playwright. Every page test got the anti-scraping refusal — the same
   surprise `/api/health` produced in §28, and the same right answer: the tests
   browse with an ordinary visitor's user agent, because that is who they stand
   in for. The filter is not weakened; it is being obeyed.
2. *A broken-image icon on four surfaces.* About 43% of the catalogue has no
   photograph, and only the catalogue card had a placeholder for that. The hero
   carousel, the landing gallery, the related strip and the detail gallery all
   rendered the browser's torn-page icon. §5 says the unhappy path is a designed
   screen; `components/MediaImage.tsx` now holds the one definition of it, for
   a record with no photo and for a photo that fails to load.
3. *Latin digits in a Persian interface.* A screenshot showed "4000M تومان"
   directly beneath "۴ رسانه یافت شد". The detail page, the related strip and
   the analytics tab formatted prices through `faNum`; the catalogue card, the
   carousel, the landing page, compare and the dashboard did not — so the same
   price read differently on the card and on the page it linked to. Two
   hand-rolled "compact number" helpers had the same problem, and are now one
   `faCompact` beside `faNum`.

**Five rounds of flakiness, and none of them were flaky.** The suite went 8/8,
then 6/8, then 7/8 with a different test failing each time. Each cause was real:

- *One IP for eight tests.* The deliberate wrong-password test spent the
  account's brute-force budget, and the later tests that need a genuine sign-in
  waited out a lockout. Each browser now arrives from its own address, as
  `test/helpers.mjs` has always done for API calls, and each failed attempt
  inside one test gets its own too.
- *A random debugging port.* Each test launches its own Chrome on
  `9000 + random(1000)`. When that collided with a Chrome still shutting down,
  the new test connected to the **old** browser and drove the previous test's
  page — which is exactly why a different assertion failed each run.
  `--remote-debugging-port=0` and reading `DevToolsActivePort` ends it.
- *Waiting for the wrong document.* `Page.navigate` resolves when the request is
  sent, and `readyState === "complete"` was still true of the page being left.
  `goto()` now stamps the outgoing document and waits for that stamp to be
  gone — which also survives a redirect, and one test asks for `/admin` as a
  visitor precisely to be sent to `/admin/login`.
- *Waiting for a neighbour instead of the thing asserted.* Next streams the
  route's `loading.tsx` and then swaps the content in; for a few frames the
  cards are present and the fallback has not been removed. A selector wait was
  satisfied by the first, while the page text still said "در حال بارگذاری".
  `waitForText()` waits for the phrase being asserted.
- *The same race again, in the one test that had been written by hand.* The
  sign-in test read `/dashboard` straight after `goto()`. But the dashboard is a
  client component: it renders "در حال بررسی احراز هویت..." until
  `GET /api/auth/me` answers, so the read landed mid-check and the assertion
  blamed the session cookie for a timing gap. It also offered
  `text.includes("پیشخوان")` as an alternative — a word that appears nowhere in
  the app, so that half could never be true and hid how narrow the real check
  was. It waits for the greeting now, like every other test in the file.

The habit worth keeping: **a flaky test is a race that has not been read
carefully yet.** Five in a row here were five real defects — three in the
harness, one in the test file, and one in the product's own protection working
as designed. The fix for the last one is the giveaway that the rule generalises:
`waitForText` existed *because* of the fourth race, and the fifth was simply a
place that had not been converted to it yet.

**What it does not cover.** Payment (there is none), SMS (dormant, §16), and
the map iframe (a third party that may not load from Iran at all). Eight flows
is a floor, not a finish.

---

## 32. A map of Iran that asks nobody for permission

**The question was whether Google could do it.** The detail page already carries
a Google map — the keyless legacy embed,
`maps.google.com/maps?q=LAT,LNG&output=embed` — and it is free, unlimited and
needs no account. That is exactly why it was chosen. The obvious next step was
to browse the catalogue on the same thing.

It cannot be done, and the reason is not effort. The embed is a cross-origin
iframe: a page cannot add its own markers to it, cannot read where the visitor
panned or zoomed, and cannot receive a click on it. That is a browser security
boundary, not a missing feature. The one Google product that *would* do it, the
Maps JavaScript API, needs a key attached to a billing account — and Google
Maps Platform is not available to Iranian accounts at all, so the account
cannot be created. Even with a key it would be unreliable on an Iranian mobile
line, which is why the embed already ships with the coordinates and an
open-in-your-map-app link stated underneath rather than conditionally: a
blocked cross-origin frame reports load either way and cannot be detected.

Every hosted alternative fails at least one of the same three tests — billed,
keyed, or unreachable from Iran. So the map is drawn instead of fetched.

**What that costs at runtime: nothing.** `lib/iran-provinces.ts` is 42 KB of
province outlines vendored into the bundle — geoBoundaries gbOpen ADM1, CC BY
4.0, credited under the map, reduced from 26,946 points to 2,658 by
Douglas-Peucker at 0.02° (about 2 km, far below one pixel at the size it is
drawn) by `scripts/build-iran-map.py`. The projection is equirectangular with
longitude squeezed by the cosine of the middle latitude, which is a dozen lines
in `lib/geo.ts`. No tile server, no key, no request that can be blocked.

**Two levels, because they answer different questions.** The country view
shades each province by how much inventory sits in it, and is built from the
`city` column — so it is exact for all 3,545 rows, including the ones that were
never geocoded. Choosing a province drops to its own pins, which is a different
and weaker claim, and the difference matters:

**The coordinates are not all trustworthy, and the map says so.** MAP-B in the
backlog claimed the coordinates were wrong and had sat there unexamined. They
are wrong in part. Measured over the dataset: 3,032 of 3,528 rows carry
coordinates, and about one in six of those sits far from the city it claims — a
row labelled تهران with a point 493 km away, Isfahan with a *median* 31 km out.
It is not one bad scraper; all three are between 16% and 27%, so the fault is
in the geocoding step. Re-geocoding needs a paid service, which is the thing
this whole decision is avoiding.

So the rule is quarantine, not repair. `isPlottable()` keeps a row off the map
when it is further than 40 km from its city's known centre — Tehran to Karaj is
about 40 km, so genuine metropolitan sprawl survives and the geocoder's misses
do not. That leaves 2,531 pins of 3,545 rows. The rows held back stay in the
catalogue, because their city and district text is still correct; only the
point is wrong. And the map prints the number it is hiding, in Persian, under
the drawing. A map that quietly drops one row in six is a map that lies; one
that says so is a map with a known edge (§5).

**Two smaller things worth keeping.** The view frames the *pins* rather than the
province, because nearly all of a province's media sits inside one city and
fitting the province spends most of the picture on empty country. And the
busiest provinces carry their names, placed busiest-first with any label that
would collide simply dropped — hover names a province, but a phone has no
hover, and the two Azerbaijans printed on top of each other otherwise.

---

## Milestone log (outputs, not diffs)

| Date | Milestone | Net structural output |
|------|-----------|-----------------------|
| 2026-09-01 | Version control | Git repo + private GitHub remote (SSH). Scraped images (712 MB) and raw dumps excluded. `LICENSE` (MIT). |
| 2026-09-01 | Test infrastructure | `test/` — dependency-free API suite + `npm run bench`. Isolated `prisma/test.db`. |
| 2026-09-01 | Bundle fix | `lib/types.ts` split out of `lib/data.ts`. Client bundle 7.7 → 1.0 MB. |
| 2026-09-01 | API completeness + docs | `GET /api/billboards/[slug]`. `docs/architecture.md`, `docs/api.md`. README architecture section rewritten. |
| 2026-09-01 | Observability | `lib/logger.ts` + `lib/api-error.ts`. Error reference ids in 5 routes + `error.tsx`. |
| 2026-09-01 | Recovery + audit | `npm run db:backup` + verified restore. `npm audit` → `STATUS.md`. |
| 2026-09-01 | Config safety + IP | `lib/env.ts` + `instrumentation.ts` (fail-closed). `lib/auth/client-ip.ts` (`TRUSTED_PROXY_COUNT`) across 20 routes. |
| 2026-09-01 | Durable audit | `persistAudit()` → `audit_logs` for all admin mutations. `/api/admin/audit` → `{ logs, persisted }`. Race test → 10 concurrent. |
| 2026-09-01 | Demo data + docs | `npm run db:seed:demo:full` (8 users / 4 admin roles / 3 owners / 4 listings / 13 reservations / 3 reviews, idempotent). `/api-docs` in-app reference. `docs/engineering-decisions.md`, `RUNBOOK.md`. |
| 2026-09-02 | Idempotency + races | `Idempotency-Key` on reservation/listing POSTs; unique `(billboardId,userId,startDate,endDate)`; wider concurrency test. |
| 2026-09-02 | Security patch | `next` 16.2.9 → 16.2.11 (10 CVEs incl. App-Router proxy bypass). Fail-closed env at boot. Non-spoofable client IP. |
| 2026-09-02 | Icon system | Site-wide keyboard-emoji → Lucide sweep (admin panel + all customer pages). Shared `TypeIcon`. |
| 2026-09-02 | Mobile | Self-hosted Vazirmatn; browser force-dark neutralised; responsive fixes for topbar / explore hero / billboard detail / admin panel / compare bar. |
| 2026-09-02 | Phone privacy | Owner phone removed from every public payload + RSC stream; `GET /api/billboards/[slug]/contact` (signed-in only); booking CTA gates on login. |
| 2026-09-02 | Admin — users | Multi-admin management (`/api/admin/users`, super_admin); registered-user directory (`/api/admin/customers`); click a user to view/edit/reset-password; open a reservation's billboard for full management. |
| 2026-09-02 | Rate-limit UX | `userApiRateLimit` 2-min cooldown (not the 15-min credential default); `rateLimited()` — one 429 shape with `Retry-After` + a Persian "try again in N minutes" + one durable `rate_limit_hit` per lockout. Store capped at 50k keys. |
| 2026-09-02 | On-time logic | Confirming a reservation flips the billboard to `reserved` (transaction); cancel releases it. BookingModal shows booked ranges + blocks a clashing selection client-side. |
| 2026-09-02 | Logging to file | `auditLog()` routes through `logger`; `LOG_DIR` → rotated `app.log`. `docs/engineering-decisions.md` §7a: why no Docker/ELK/Sentry yet + the path to it. |
| 2026-09-02 | SMS (dormant) | §16 — Kavenegar adapter + `otp_codes` + `/api/auth/otp/{send,verify}` + `/reset-password` page + welcome SMS. Inert until `KAVENEGAR_API_KEY`. |
| 2026-09-02 | Efficiency | Admin billboards list: DB-side filter/sort/paginate instead of loading all 3.5k rows. Overview "co-located clusters" stat O(n²) → O(n) grid bucket. Lint clean (0 warnings). |
| 2026-09-02 | Data cleanup + defense prep | `db:dedupe --apply` → 17 cross-source duplicate rows removed (3549 → 3532; pre-dedupe backup kept). `LOG_DIR` set. `defense.md` (screenshot + talking-point checklist) and `defense.md` (A− rubric) added. |
| 2026-09-02 | **Final review — business model** | Reservation subsystem removed (§17). Rasamap is a directory: buyers get the owner's phone, owners pay to be listed. Two plans + a manual, auditable payment confirmation (§18). |
| 2026-09-02 | **Final review — correctness** | Timing-attack padding hash was not a valid bcrypt hash (0 ms vs 250 ms — enumeration by stopwatch); analytics reported 100% image coverage instead of 57%; `hasImages` drifted on admin image edits; unapproved listings were readable by URL; both catalogue sorts ordered by the wrong column (§21). All fixed, each with a regression test. |
| 2026-09-02 | **Final review — honesty** | Fake scraper panel (canned log lines, hardcoded "45 processed") replaced with a read-only status view fed by real counts. Listing photo upload made real and hardened (§19). Ratings now recomputed from the reviews table. |
| 2026-09-02 | **Final review — anti-scraping** | Bot UAs blocked on pages as well as the API, per-IP page budget, hotlink protection, page cap 100 → 48, dead bulk `pins` endpoint and unused Leaflet dependencies removed (§20). |
| 2026-09-02 | **Performance — demo mode** | §22 — measured `next dev` at 9.7 s CPU vs `next start` at 0.1 s for the same ten routes (~97×). Added `npm run demo`. Red-flagged in README, `docs/STATUS.md`, `defense.md`, `defense.md`, `RUNBOOK.md`, `docs/STATUS.md`, `CLAUDE.md` and `docs/roadmap.html` because it is the rule most easily forgotten. |
| 2026-09-02 | **Performance — image weight** | §22a — 1332 fully-opaque PNGs re-encoded to progressive JPEG offline (Pillow): 493 MB → 64 MB (87%), RMSE 2.37/255, dimensions unchanged, 231 transparent PNGs untouched, references rewritten from an explicit map in both DB and seed JSON. `/explore` page image weight 4.0 MB → 1.09 MB. `loading="lazy"` + `decoding="async"` on every thumbnail. |
| 2026-09-02 | **Performance — always-on animation** | Cursor-parallax and scroll-linked SVG redraw removed from `BackgroundPattern` (vines now draw once on mount); landing page stopped re-rendering on every scroll frame (continuous `scrollY` state → one `scrolled` boolean at a 60 px threshold); decorative animation pauses via `visibilitychange` while the tab is hidden. |
| 2026-09-07 | **V1 — server-rendered catalogue** | `/explore` and `/` became Server Components reading the DB directly; the query string is the single source of truth for the catalogue. Prices in `/explore` HTML 0 → 24. `/` CPU 16.5 → 1.9 ms (prerendered). `/explore` CPU flat — see the V1 card in `docs/roadmap.html` for why the "SSR is cheaper" premise was half wrong. |
| 2026-09-07 | **Shared cache (dormant)** | §25 — `cache-handler.js`: Redis-backed cache with a per-process memory tier and pub/sub tag invalidation, verified across two processes. Inert until `REDIS_URL`. |
| 2026-09-07 | **Payload narrowing** | `CatalogueItem` — cards receive the twenty fields they draw instead of the whole record. `/explore` RSC payload 52.4 → 39.4 KB; coordinates no longer shipped for the whole result set (§20). |
| 2026-09-07 | **Cache Components, evaluated** | §26 — built, measured at 10.24 → 10.32 ms on `/explore`, reverted. The media page's record and related-media reads were kept and are now cached. |
| 2026-09-07 | **V2 — images** | §22c — `next/image` on a custom loader over pre-built variants, no `/_next/image`. Landing on a phone 1918 → 475 KB; catalogue list 1155 → 384 KB; layout shift eliminated. Cost: +0.4 ms CPU on `/explore`. `npm run images:variants` / `images:check`. |
| 2026-09-07 | **V3 — PostgreSQL, dormant** | §27 — engine read from `DATABASE_URL`; the two engine-specific spots (JSON path, `contains` case) handled; `npm run db:to-postgres` / `db:to-sqlite`. Proved against PostgreSQL 16: 3,562 rows moved, counts matched, app served, identical answers from both engines, switched back, 113/113. Still on SQLite. |
| 2026-09-08 | **V4 — deployment surface** | §28 — `/api/health` (real DB ping, exempt from the bot filter, 3 tests); `backup-db.sh` made engine-aware after §27 and both paths exercised; restore rehearsed; `deploy/` nginx + systemd + backup timer; RUNBOOK deployment order. Acceptance test run over a `trycloudflare` tunnel: rule 9 verified against a real proxy (`Secure` present over HTTPS, absent over localhost, same build). Domain and host still to buy. |
| 2026-09-08 | **V5 — CSP and security cleanup** | §29 — six dead origins removed from the CSP (incl. `unpkg.com` in `script-src`); `'unsafe-eval'` dropped after proving zero `eval(` in the bundle; `X-XSS-Protection` removed; `robots.txt` reduced to one generated source whose `Sitemap` follows `SITE_URL`; dead `NEXT_PUBLIC_NESHAN_KEY` removed and `NESHAN_API_KEY` demoted to optional. Nonce-based `script-src` measured at 1.86 → 8.30 ms on the landing page and declined. |
| 2026-09-11 | **Map view, no provider** | §32 — `/explore/map`: 31 provinces as SVG shaded by inventory, pins for a chosen province, filters carried in the URL. `lib/iran-provinces.ts` (42 KB, vendored, geoBoundaries CC BY 4.0) + `lib/geo.ts` + `scripts/build-iran-map.py`. No key, no tiles, no runtime request. MAP-B confirmed and quarantined: `isPlottable()` holds back the ~1-in-6 coordinates that sit far from their own city, and the map states the count it is hiding. No new query — the province counts come from a `groupBy` `getSiteStats` already ran. |
| 2026-09-09 | **V7 — browser tests** | §31 — `test/browser.mjs`, a 359-line CDP driver over the installed Chrome, no new dependency. `npm run test:e2e`: 8 flows on the production build, screenshots on failure. Found the headless-UA 403, missing image placeholders on four surfaces (`MediaImage`), and Latin digits in prices (`faCompact`/`faNum`). Five flakiness causes diagnosed and fixed. |
| 2026-09-08 | **V6 — findability** | §30 — titles on the seven pages that had none (three `noindex`); generated Open Graph card with the project's own font, explicit RTL word order and ZWNJ handling; `Product`/`Offer` JSON-LD on media pages with Toman→IRR conversion; sitemap verified at 3,532/3,532 with no unpublished leak; `manifest.ts` + 192/512 icons. |
