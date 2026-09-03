# Rasamap — Engineering Decisions

The systems this project runs, **what each one is**, **why it exists**, and
**where it applies**. This is the reference a reviewer (or a report generator)
reads to understand the engineering — not the line-by-line diffs, the shape they
add up to.

Format of each record: **Decision · Context · Structure it produces · Why here ·
Where it applies · How it's verified**.

Companion docs: [`architecture.md`](./architecture.md) (data-flow model),
[`api.md`](./api.md) (endpoint reference), [`AUDIT.md`](./AUDIT.md) (13-layer
production assessment), [`security-audit.md`](./security-audit.md).

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
`docs/demo-accounts.md`. `app/api-docs/page.tsx` is a Server Component that
reads `docs/api.md` and renders it (escaped-first, fixed transform set — no
markdown library, no CDN); `next.config.ts` traces the file into the prod build.

**Why here.** A reviewer needs realistic data to click through, and a stranger
needs to see the API surface without a foreign service. Both stay in-repo and
work offline.

**Verified.** Seed re-run is idempotent (counts stable); `/api-docs` returns 200
with rendered tables under `next start`.

---

## 16. SMS & phone-verified password reset — built, shipped dormant

**Decision.** The full SMS layer (Kavenegar) and a phone-OTP password-reset
flow are implemented and tested, but inert until `KAVENEGAR_API_KEY` is set.
Nothing about registration, login or the OTP endpoints breaks while it's off.

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
  per IP (`otpSendRateLimit` 3/10 min, `otpSendIpRateLimit` 10/hr,
  `otpVerifyRateLimit` 10/10 min). `send` responds identically whether or not
  the number is registered (no account enumeration). `verify` checks the code
  and sets the new bcrypt hash in one step — no intermediate token — and audits
  it as `password_reset_self`. `OTP_DEV_ECHO=1` returns the code in the `send`
  response for local testing (ignored under `NODE_ENV=production`).
- `/reset-password` — a 3-step page (phone → code + new password → done), linked
  from `/login` as «رمز عبور را فراموش کرده‌اید؟».
- Register hook — a fire-and-forget welcome SMS after `prisma.user.create`;
  it can never fail the sign-up.

**How to switch it on.** Buy a Kavenegar line, put `KAVENEGAR_API_KEY` (and
optionally `KAVENEGAR_SENDER` / `KAVENEGAR_OTP_TEMPLATE`) in `.env`, redeploy.
No code change: the welcome SMS and the reset flow start delivering
immediately. `.env.example` documents every knob.

**Verified.** Tests (part of the 71): an unknown phone gets a generic 200 and
no code; a full send → verify → login with the new password succeeds; a wrong
code is rejected; the per-phone send limit returns 429 with `Retry-After`.

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

**The tension.** Every measure above trades away discoverability. Googlebot and
friends are explicitly exempted and the sitemap is kept, because a marketplace
nobody can find is worse than one that can be copied slowly.

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

---

## Milestone log (outputs, not diffs)

| Date | Milestone | Net structural output |
|------|-----------|-----------------------|
| 2026-09-01 | Version control | Git repo + private GitHub remote (SSH). Scraped images (712 MB) and raw dumps excluded. `LICENSE` (MIT). |
| 2026-09-01 | Test infrastructure | `test/` — dependency-free API suite + `npm run bench`. Isolated `prisma/test.db`. |
| 2026-09-01 | Bundle fix | `lib/types.ts` split out of `lib/data.ts`. Client bundle 7.7 → 1.0 MB. |
| 2026-09-01 | API completeness + docs | `GET /api/billboards/[slug]`. `docs/architecture.md`, `docs/api.md`. README architecture section rewritten. |
| 2026-09-01 | Observability | `lib/logger.ts` + `lib/api-error.ts`. Error reference ids in 5 routes + `error.tsx`. |
| 2026-09-01 | Recovery + audit | `npm run db:backup` + verified restore. `npm audit` → `docs/security-audit.md`. |
| 2026-09-01 | Config safety + IP | `lib/env.ts` + `instrumentation.ts` (fail-closed). `lib/auth/client-ip.ts` (`TRUSTED_PROXY_COUNT`) across 20 routes. |
| 2026-09-01 | Durable audit | `persistAudit()` → `audit_logs` for all admin mutations. `/api/admin/audit` → `{ logs, persisted }`. Race test → 10 concurrent. |
| 2026-09-01 | Demo data + docs | `npm run db:seed:demo:full` (8 users / 4 admin roles / 3 owners / 4 listings / 13 reservations / 3 reviews, idempotent). `/api-docs` in-app reference. `docs/engineering-decisions.md`, `docs/demo-accounts.md`. |
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
| 2026-09-02 | Data cleanup + defense prep | `db:dedupe --apply` → 17 cross-source duplicate rows removed (3549 → 3532; pre-dedupe backup kept). `LOG_DIR` set. `docs/presentation-prep.md` (screenshot + talking-point checklist) and `docs/self-assessment.md` (A− rubric) added. |
| 2026-09-02 | **Final review — business model** | Reservation subsystem removed (§17). Rasamap is a directory: buyers get the owner's phone, owners pay to be listed. Two plans + a manual, auditable payment confirmation (§18). |
| 2026-09-02 | **Final review — correctness** | Timing-attack padding hash was not a valid bcrypt hash (0 ms vs 250 ms — enumeration by stopwatch); analytics reported 100% image coverage instead of 57%; `hasImages` drifted on admin image edits; unapproved listings were readable by URL; both catalogue sorts ordered by the wrong column (§21). All fixed, each with a regression test. |
| 2026-09-02 | **Final review — honesty** | Fake scraper panel (canned log lines, hardcoded "45 processed") replaced with a read-only status view fed by real counts. Listing photo upload made real and hardened (§19). Ratings now recomputed from the reviews table. |
| 2026-09-02 | **Final review — anti-scraping** | Bot UAs blocked on pages as well as the API, per-IP page budget, hotlink protection, page cap 100 → 48, dead bulk `pins` endpoint and unused Leaflet dependencies removed (§20). |
| 2026-09-02 | **Performance — demo mode** | §22 — measured `next dev` at 9.7 s CPU vs `next start` at 0.1 s for the same ten routes (~97×). Added `npm run demo`. Red-flagged in README, `docs/STATUS.md`, `docs/final-review-notes.md`, `docs/presentation-prep.md`, `RUNBOOK.md`, `PLAN.md`, `CLAUDE.md` and `docs/roadmap.html` because it is the rule most easily forgotten. |
| 2026-09-02 | **Performance — image weight** | §22a — 1332 fully-opaque PNGs re-encoded to progressive JPEG offline (Pillow): 493 MB → 64 MB (87%), RMSE 2.37/255, dimensions unchanged, 231 transparent PNGs untouched, references rewritten from an explicit map in both DB and seed JSON. `/explore` page image weight 4.0 MB → 1.09 MB. `loading="lazy"` + `decoding="async"` on every thumbnail. |
| 2026-09-02 | **Performance — always-on animation** | Cursor-parallax and scroll-linked SVG redraw removed from `BackgroundPattern` (vines now draw once on mount); landing page stopped re-rendering on every scroll frame (continuous `scrollY` state → one `scrolled` boolean at a 60 px threshold); decorative animation pauses via `visibilitychange` while the tab is hidden. |
