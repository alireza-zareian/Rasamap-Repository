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
`app/api/reservations`, `app/api/listings`.

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

**Why here.** Login, registration, password paths, search and every write are
the endpoints an abuser hammers; the fix is one small helper, not a service.

**Where it applies.** All rate-limited routes; audit log IP field.

**Verified.** Test: 12 rapid logins from one IP → `429`. Benchmark:
`BENCH_SINGLE_IP=1` shows 60 requests then `429`.

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

**Why here.** It is the self-hosted, zero-dependency equivalent of an
error-tracking service — no paid platform, works offline. Pattern taken from a
Django reference project's `log_formatters.py` + middleware.

**Where it applies.** `serverError` wired into `/api/billboards`,
`/billboards/[slug]`, `/billboards/pins`, `/reservations`, `/admin/billboards`;
`logger` used by `env` validation and `persistAudit`.

**Verified.** Manual: a forced 500 returns a `ref` and no stack; the same `ref`
appears in the log line.

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
`PATCH /api/admin/reservations/[id]`.

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

Pending (tracked in `PLAN.md` "Next update"): `Idempotency-Key` + reservation
slot unique constraint (needs one `prisma db push` on dev.db).
