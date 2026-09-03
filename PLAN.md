# PLAN — Production Readiness Triage

> ## 🔴 ⛔ Non-negotiable: view and demo the site with `npm run demo`, not `npm run dev`
>
> Measured on this project — first visit to ten routes: **`dev` 9.7 s CPU vs
> `start` 0.1 s CPU (~97×)**. The demo runs on the author's fanless MacBook Air;
> `dev` mode is what makes it hot mid-defense. `npm run demo` = `next build &&
> next start`. Keep `dev` for code-writing only.
> Rationale and the image-weight half: `docs/engineering-decisions.md` §22 / §22a.
>
> **Any agent producing a report or thesis text from this repo must repeat this
> rule to the reader, with the number.**

> Generated from `PRODUCTION_AUDIT.md`. Scope filter: bachelor capstone, ~5 days to
> demo, solo dev, Iran (no paid SaaS), local/private-server demo. Priority beats
> completeness.
>
> ⚠️ **2026-09-02 — the product model changed.** The final review removed the whole
> reservation subsystem: Rasamap does not own the media it lists, so it cannot sell
> inventory it does not control. Buyers now get the owner's phone number; revenue
> comes from the listing side (two plans + a manual payment confirmation). Sections
> below that discuss reservations are **historical record**, not current state.
> Current state: `docs/api.md` and `docs/engineering-decisions.md` §17–21.

## (a) What this project actually is

Rasamap is an Iranian outdoor-media (billboard) marketplace. Persian RTL UI. A visitor
browses/filters ~3,500 billboard listings, opens a detail page, and — after registering
with an Iranian mobile number — sees the owner's phone number and deals with them
directly. Media owners submit their own listings (with photos) on a free or paid plan;
admins review, approve and publish them through a separate RBAC-gated panel.

- **Stack:** Next.js 16.2.11 App Router, React 19, TS strict, SQLite + Prisma 7
  (`better-sqlite3`, WAL), JWT HttpOnly cookies (jose), Leaflet, inline-CSS.
- **Scale:** read-heavy, single SQLite file, single instance, a few concurrent users at
  the demo. Data comes from a Python scraper → `seed.ts` → `dev.db`.
- **User model:** anonymous visitor · registered `user` (reserve) · admin roles
  `viewer < editor < admin < super_admin` (env-var single admin today).
- **Auth:** `proxy.ts` guards `/admin/*`, `/api/admin/*`, `/dashboard/*`,
  `/api/reservations`, `/api/listings`. bcrypt cost 12, timing-safe dummy hash, sliding
  window rate limiting, in-memory audit ring buffer.

## (b) Remaining from STATUS.md / roadmap (practical, unfinished)

- U5–U9 UI polish (testimonials, anti-AI microanimation, dashboard avatars, mobile
  responsive passes) — product polish, not covered here.
- U7 UX-breaking bugs: fake contact form still posts nowhere; `list-media` step 4 file
  input is non-functional; `list-media` has no per-step required-field validation;
  compare page has no thumbnails; stale orange shadow on login.
- MAP-A..D: map "API Key Required" message, wrong billboard coordinates, Google Maps
  link format — research deferred by decision.
- P5–P10 performance backlog (next/image, RSC refactor, PPR, bundle analyzer, JSON-LD) —
  documented, post-demo.
- next-tasks.md P1: `AnalyticsTab` — check whether it now reads `/api/analytics` (route
  exists) or still `lib/data.ts`.

## (c) Found during audit (missing / wrong)

| # | Finding | Severity |
|---|---------|----------|
| F1 | **Repo is not a git repository** (`.git` absent) — Phases 11/12 blocked, no history, no rollback. | High |
| F2 | No `.env.example` in repo. → **fixed** | Med |
| F3 | `dev.db` (12 MB + WAL) not in `.gitignore`; would be committed on `git init`, may hold real user data. → **fixed** | High |
| F4 | `project-ai.zip` (265 KB) tracked at repo root; `.DS_Store` scattered. → gitignore updated; zip deletion needs user OK | Low |
| F5 | No `PRE_DEPLOY_CHECKLIST.md` / `RUNBOOK.md`. → **fixed** | Med |
| F6 | No `LICENSE`. | Low |
| F7 | No automated tests at all — nothing to run in CI or pre-deploy. | Med (accepted) |
| F8 | Docs disagree on row count (2,808 vs 3,545) and on whether `lib/data.ts` is types-only or imports `billboards.json`. Reviewer-confusing. | Low |
| F9 | Reservation overlap check is inside `$transaction`. Test T1.5 fires two identical concurrent POSTs → exactly one 201, one 409, so the guard holds on this single-process + single-writer-SQLite setup. Still no DB-level exclusion constraint, so it would need revisiting on a multi-instance / different DB. | Low — verified OK for now |
| F10 | Rate limiter + audit log are in-memory → reset on restart, not multi-instance. Acceptable for single-instance demo; state it out loud. | Low (accepted) |
| F11 | CSP allows `script-src 'unsafe-inline' 'unsafe-eval'` (Leaflet). Documented tradeoff. | Low (accepted) |
| F12 | No structured logging / rotating log file — only `console.error` guarded by `NODE_ENV`. Professors often ask. | Med |
| F13 | No DB backup script or documented restore. | Med |
| F14 | Object-level authz on `/api/reservations/my` and admin routes: verify a user cannot read another user's reservation by ID. | Med — needs check |
| F15 | **`lib/data.ts` mixed pure types + `typeLabels` + a 4 MB `billboards.json` import in one module.** Every page rendering a billboard card imported `typeLabels`, so the bundler pulled the whole module → a **6.7 MB client chunk** of scraped billboard JSON shipped to every visitor (verified in `.next/static/chunks`). Fixed: split into `lib/types.ts` (data-free). Client chunks 7.7 MB → 1.0 MB. | High → **fixed 2026-09-01** |

## (d) Priority ranking

### Tier 1 — blocks demo / embarrasses in front of professors (do first)
- [x] T1.1 `.env.example` (names only) — 5 min
- [x] T1.2 `.gitignore`: ignore `*.db*`, zips, logs; keep `.env.example` — 5 min
- [x] T1.3 `git init` + first clean commit on `main` + pushed to GitHub (private,
      SSH auth) — 155 files / ~6 MB, no secrets. `public/images/scraped/` (712 MB) and
      raw scraper dumps excluded via `.gitignore`. `LICENSE` (MIT) added. (F1, F3, F4)
- [x] T1.4 `npm run build` OK, `tsc --noEmit` clean, `npm test` 24/24. `npm run lint`
      still reports 36 pre-existing errors (react-hooks etc.) — same as before this work,
      zero added. Tracked as separate lint-debt item for the next round.
- [x] T1.5 Automated instead of manual: `npm test` — dependency-free `node:test` suite
      (`test/`) hits a real `next dev` server on an isolated `prisma/test.db`. 19 tests,
      all passing. Covers validation, sort/param allowlists, per-IP login rate limit,
      no user enumeration, reservation race guard (concurrent double-submit → exactly
      one row), and object-level authz. Also added `npm run bench` (dependency-free
      load benchmark). (Phase 10.1 / 7.4 / 7.5 / 8.3 / 16)
- [x] T1.6 U7 audit: login shadow, fake contact form (now honest info cards + Lucide
      icons + mailto/Telegram), list-media file input, and compare thumbnails were
      **already fixed** in earlier work — STATUS.md's list was stale. Remaining real
      gap fixed now: per-step required-field validation in `/list-media` (`validateStep`
      blocks «بعدی» until the step's fields are valid).

### Tier 2 — infrastructural, cheap now / expensive later
- [x] T2.1 `PRE_DEPLOY_CHECKLIST.md` + `RUNBOOK.md` — 30 min
- [x] T2.2 `docs/AUDIT.md` 13-layer table — 30 min
- [x] T2.3 `scripts/backup-db.sh` + `npm run db:backup` (online `.backup`, keeps last 10,
      `BACKUP_DIR` override, cron one-liner in RUNBOOK). Test restore **run and verified**
      2026-09-01: row counts matched, `PRAGMA integrity_check` = ok. (F13, Phase 9.7)
- [x] T2.4 `lib/logger.ts` (JSON line per log to stdout/stderr, size-rotated file when
      `LOG_DIR` set, level filter, no deps, PII rule documented) + `lib/api-error.ts`
      `serverError()` — logs the stack with a short ref id, returns a generic Persian
      500 carrying that id. Wired into `/api/billboards`, `/billboards/[slug]`,
      `/billboards/pins`, `/reservations`, `/admin/billboards`. `app/error.tsx` shows
      `error.digest` as «کد خطا». (F12, Phase 4 + 5.3)
- [x] T2.5 `npm audit` → `docs/security-audit.md`. 10 advisories (1 mod, 9 high), **all**
      build-time (postcss) or in an unused feature (sharp / `next/image`), none on the
      request path. The `next` CVEs were fixed by bumping to `16.2.11` (2026-09-02); the
      post-presentation bump, documented with rationale + monthly re-check note.
- [x] T2.6 Object-level authz — `/api/reservations/my` confirmed scoped by session
      (test: user B cannot see user A's reservation). Admin GET/POST confirmed to
      enforce role at the route, not just the UI. `/api/reviews` + admin `[id]` still
      worth a direct read. (F14, Phase 7.4)
- [x] T2.7 `LICENSE` (MIT) added earlier. README: architecture section rewritten as
      neutral documentation (no «for the reviewer» tone), accurate mermaid + file→layer
      table, correct DB description, links to `docs/architecture.md` + `docs/api.md`.
      Clean-machine `npm ci` walkthrough + screenshots: still pending (next round).

### Tier 3 — fast wins, high value/minute
- [x] T3.1 Real counts from `dev.db` (3545 billboards / 2015 with images / 3032 geocoded)
      propagated to STATUS.md (was 2808) and project-reference.md. `lib/data.ts` role
      corrected everywhere. (F8)
- [x] T3.2 `project-ai.zip` deleted from the working tree (was never committed;
      regenerable via the README zip command). `.gitignore` already excludes it.
- [ ] T3.3 Responsive spot-check at 360/390/768/1280 on landing, explore, detail,
      dashboard; fix only hard breaks (horizontal scroll, unreachable buttons)
      (Phase 9) — 1.5 h
- [x] T3.4 `AnalyticsTab` confirmed — `components/AnalyticsTab.tsx` fetches
      `/api/analytics?city=…` (client), does not touch `lib/data.ts`.
- [x] T3.5 (added) HTTP cache headers on the remaining cacheable GET routes:
      `/api/stats` (`max-age=120`), `/api/analytics` (`max-age=60`), `/api/reviews`
      (`max-age=30`) — were `no-store`/absent. Safe incremental tuning.

### Won't fit / deliberately skipped (tell the professor)
- Full load test 50–200 concurrent users (Phase 8.8) — partially done: `npm run bench`
  gives ~108 req/s on `/api/billboards` in dev mode, throughput flat from 20→50 clients
  (single Node process + sync SQLite reads = the ceiling). First hard limit under write
  load is SQLite's single-writer lock on `POST /api/reservations`.
- CI/CD pipeline (Phase 13.4) — no test suite to run; not worth it for a local demo.
- Writing a real test suite (Phase 7 / 16) — 5 days is not enough to do it honestly.
- Redis-backed rate limit / audit persistence (Phase 8.7 / 6.6) — single instance,
  in-memory is fine; stated as a known limitation.
- Brotli/caching server, CDN, load balancing, read replicas, multi-tenancy,
  containerisation, API versioning, GDPR pipeline, SPF/DKIM/DMARC, payment gateway
  (Phase 10 / 15) — Overkill for a capstone; see `docs/AUDIT.md`.
- Structure refactor / file moves (Phase 1) — current layout is already conventional
  Next.js; a move this close to the deadline is pure risk.

## Progress log

- 2026-09-01 — Created `PLAN.md`, `docs/AUDIT.md`, `PRE_DEPLOY_CHECKLIST.md`,
  `RUNBOOK.md`, `.env.example`; hardened `.gitignore`; added `/prod-audit` command and
  standing rules to `CLAUDE.md`. No application code changed.
- 2026-09-01 — `git init`; excluded 712 MB of scraped images + raw dumps; added
  `LICENSE` (MIT); first commit `cf77994` on `main`; pushed to private GitHub repo
  `alireza-zareian/Rasamap-Repository` over SSH. Verified pushed tree: 155 files, no
  secrets. **Next:** revoke the leaked `ghp_` token; tag a demo version before the
  presentation.
- 2026-09-01 — Added `test/` — dependency-free API test suite (`npm test`, 19 tests
  passing) on an isolated `prisma/test.db`, plus `npm run bench`. No application code
  changed. Covers T1.5 (automated) and most of T2.6. Race guard verified.
- 2026-09-01 — Architecture: confirmed the app is already API-driven for every client
  interaction (mapped all 8 pages); the only direct-DB path is the `/billboard/[slug]`
  Server Component, which is the idiomatic Next.js pattern. Added `GET /api/billboards/[slug]`
  so every resource also has a REST endpoint (+3 tests, +2 smoke tests → 24/24). Wrote
  `docs/architecture.md` (two data paths, kitchen analogy, perf comparison, DRF contrast)
  and `docs/api.md` (~23-endpoint reference). Rewrote the stale README architecture section
  (it still claimed "no real DB" and "pages import lib/data.ts"). Added a standing rule to
  CLAUDE.md + AGENTS.md: reviewer-facing reports must carry the architecture explanation.
- 2026-09-01 — F15 fix: split `lib/data.ts` → new `lib/types.ts` (types +
  `typeLabels`/`typeIcons`, zero data). Repointed 20 import sites to `@/lib/types`.
  `lib/data.ts` (static/scraped arrays + 4 MB JSON) is now imported only by
  `prisma/seed.ts`. Result: client chunks **7.7 MB → 1.0 MB**, the 6.7 MB scraped-JSON
  chunk gone. Verified: `tsc` clean, `npm run build` OK, `npm test` 19/19, lint delta
  zero (36 pre-existing errors untouched). Behaviour unchanged — types are compile-time
  only, `typeLabels`/`typeIcons` moved verbatim. Docs updated (CLAUDE.md, AGENTS.md,
  STATUS.md, project-reference.md).
- 2026-09-01 — Batch (PLAN groups A/B/C + safe tuning): structured logger
  (`lib/logger.ts` + `lib/api-error.ts`, error ref ids, wired into 5 routes +
  `error.tsx`); `npm run db:backup` + verified test restore; `npm audit` →
  `docs/security-audit.md` (all 10 deferred with rationale); doc row-counts corrected
  (2808→3545); `project-ai.zip` deleted; `/list-media` per-step validation; HTTP cache
  headers on `/api/stats` `/api/analytics` `/api/reviews`; README + `docs/architecture.md`
  re-toned as neutral documentation (agent directive kept only in CLAUDE.md/AGENTS.md);
  roadmap footer synced. Verified: `tsc` clean, `npm run build` OK, `npm test` 24/24,
  `npm run lint` 36 errors (unchanged, −1 warning). Reviewed Tadrisino (internship
  Django repo) for transferable patterns — see the backlog below.

- 2026-09-01 — Batch (backlog N1 + part of N2): `lib/env.ts` + `instrumentation.ts`
  fail-closed env validation at startup; `lib/auth/client-ip.ts` `getClientIp()` with
  `TRUSTED_PROXY_COUNT` (fixes X-Forwarded-For spoofing of rate-limit buckets) applied
  across all 20 API routes; race-guard test widened to 10 concurrent → exactly one 201;
  durable audit — `persistAudit()` writes `billboard_create/update/delete` and
  `reservation_status_change` to the `audit_logs` table (already in the DB, no
  migration), `/api/admin/audit` now returns `{ logs, persisted }`. Verified: tsc clean,
  build OK, `npm test` 25/25, lint 63 (unchanged, 0 added). **Deferred, needs your OK:**
  Idempotency-Key + `Reservation` slot unique constraint (needs one
  `prisma db push --accept-data-loss` on dev.db — Prisma's AI guard blocks it without
  explicit consent; dev DB, backed up, verified no duplicate rows so no real data loss).
  **Assessed and skipped (not Iran — fit/risk):** PPR, streaming, `useOptimistic`,
  `next/image`, request-log HOF wrapper — the app is client-component-heavy so PPR/
  streaming barely apply; the booking flow correctly waits on server validation so
  `useOptimistic` would add complexity for negative value; `next/image` is high blast
  radius for marginal gain. The real wins (bundle split 7.7→1.0 MB, cache headers) are done.

- 2026-09-01 — Batch: `docs/engineering-decisions.md` — the standing record of
  which systems the project runs, what structure each produces, why, and where it
  applies (the spine for later visual reports). `npm run db:seed:demo:full` —
  idempotent demo dataset: 8 users (one per state), 4 admins (one per role), 3
  owners + 4 pending listings, 13 reservations across all statuses, 3 reviews;
  account sheet in `docs/demo-accounts.md`. `/api-docs` — self-hosted, no-CDN
  in-app render of `docs/api.md` (traced into the prod build via `next.config.ts`).
  Verified: tsc clean, build OK, `npm test` 25/25, lint 63 (unchanged), seed
  idempotent, `/api-docs` 200 under `next start`.

## Next update — prioritized backlog (awaiting go-ahead)

Merges patterns worth borrowing from Tadrisino with what is still open here. Nothing
below is started. Grouped by value-for-effort; each notes whether it needs a Prisma
migration or touches product behaviour.

### N1 — quick, safe, do first
- [x] `lib/env.ts` + `instrumentation.ts` — fail-closed env validation at startup.
- [x] X-Forwarded-For trust fix — `lib/auth/client-ip.ts` `getClientIp()` +
      `TRUSTED_PROXY_COUNT`, applied to all 20 API routes.
- [x] Race test widened to 10 concurrent identical POSTs → exactly one 201.

### N2 — worth it, moderate effort
- [x] Persist status-change audit — `persistAudit()` to the existing `audit_logs`
      table (no migration). `billboard_create/update/delete`, `reservation_status_change`.
      `/api/admin/audit` now returns `{ logs, persisted }`.
- [x] **Idempotency-Key** on `POST /api/reservations` and `POST /api/listings` +
      `Reservation(billboardId,userId,startDate,endDate)` unique constraint. Migration
      `20260901120500` hand-applied to dev.db (additive only; `prisma migrate dev`
      wanted a full reset over pre-existing billboards-table drift). `lib/idempotency.ts`,
      +2 tests. 27/27.
- [x] Structured request-log HOF (`lib/api-log.ts` `withApiLog`) — now wired into
      **every** API route (all 23 files, GET/POST/PUT/PATCH/DELETE). Each request
      emits one `api_request` line: route/method/path/status/ms, no body/headers/PII.
      Verified live.
- [x] DB-backed audit **viewer** — AuditPanel has a پایدار/زنده toggle; the persisted
      view renders `audit_logs` rows with their `details`.
- [~] Responsive — added `html,body { overflow-x: clip }` safety net; the `@media 640`
      block already collapses every multi-col grid; narrowed CompareModal's fixed column.
      **Still needs a real-browser pass at 360/390/768/1280** — could not verify headless.
- [x] Clean-machine walkthrough — actually ran `git clone` → `npm ci` → `prisma migrate
      deploy` → `npm run db:seed` → `npm run build` in a temp dir. **Found and fixed two
      real breakers:** (1) `prisma.config.ts`'s `env("DATABASE_URL")` threw during
      `postinstall: prisma generate` before any `.env` exists → switched to a
      `process.env.DATABASE_URL ?? "file:./dev.db"` fallback; (2) the migration history
      built a `billboards` table missing `hasImages` / `ownerId` / most indexes (added to
      `dev.db` earlier via `db push`, never migrated) → `db:seed` failed with P2022. Added
      migration `20260901123000_reconcile_billboards_schema` (from `prisma migrate diff`),
      marked applied on `dev.db`, verified a fresh DB now migrates + seeds 3545 rows.
      `prisma migrate status` → "up to date". `prisma/seed.ts` also got `import
      "dotenv/config"` + a URL fallback. README setup now says `cp .env.example .env`.
      Screenshots still pending (can't capture headless).

### N3 — post-presentation polish (architectural shape is already fine)
> Assessed 2026-09-01: PPR, streaming and `useOptimistic` are a poor fit for the
> current codebase (landing / explore / dashboard are all `"use client"`, and the
> booking flow must wait on server-side overlap validation — optimistic UI there would
> add rollback complexity for no gain). `next/image` touches every card image for a
> marginal payoff. Left here as deliberate, low-priority polish, not recommended before
> the presentation.
- [ ] `next/image` for scraped photos (`remotePatterns` + full visual test) — also
      clears the `sharp` audit advisory. STATUS.md P5.
- [ ] Partial Prerendering on `/explore` (`experimental_ppr`) — only worthwhile after a
      Server-Component refactor of the page. STATUS.md P7.
- [ ] `useOptimistic` / Server Action on the booking form — only if the flow is
      reworked so the client can safely predict the outcome. STATUS.md P8.
- [ ] More of the detail-page chrome as Server Components / streaming. STATUS.md P6.
- [ ] `@next/bundle-analyzer` pass. STATUS.md P9. · JSON-LD on detail pages. P10.
- [x] Bumped `next` 16.2.9 → 16.2.11 (2026-09-02) — closed 10 Next.js advisories
      incl. the App-Router proxy-bypass. Remaining `npm audit` items (postcss/sharp/
      mysql2/…) are transitive build-tooling / unused paths — see `docs/security-audit.md`.
      Clearing those needs `next@16.3.x`; deferred post-presentation.
- [x] Lint debt cleared — 63 problems → 10 (0 errors). Real fix in AnalyticsTab;
      the rest were legit data-fetch / mount-hydration effects, scoped-disabled with a
      reason. Remaining 10 are `@next/next/no-page-custom-font` (error/404 pages must
      carry their own font link — no App Router fix) + 2 benign `exhaustive-deps`.
- [x] `/api-docs` — self-hosted render of `docs/api.md` (no CDN, works offline). Done
      in an earlier batch.

### Not bringing from Tadrisino (would be bloat here)
- Internal-service-key / webhook-secret permission classes — no server-to-server
  endpoints in this app.
- `SELECT … FOR UPDATE` lock semantics — SQLite has no row locks; a transaction + a
  unique constraint is the correct tool.
- Grafana / Loki / Alloy stack — the JSON-lines logger + rotated file is the free
  self-hosted equivalent; a full LGTM stack is Overkill for a capstone.
- A `manage.py`-style CLI — npm scripts already cover it.
