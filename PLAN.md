# PLAN — Production Readiness Triage

> Generated from `PRODUCTION_AUDIT.md`. Scope filter: bachelor capstone, ~5 days to
> demo, solo dev, Iran (no paid SaaS), local/private-server demo. Priority beats
> completeness.

## (a) What this project actually is

Rasamap is an Iranian outdoor-media (billboard) marketplace. Persian RTL UI. A visitor
browses/filters ~2,800–3,500 billboard listings (map + grid), opens a detail page, and —
after registering with an Iranian mobile number — requests a date-range reservation.
Admins manage listings and reservations through a separate RBAC-gated panel.

- **Stack:** Next.js 16.2.9 App Router, React 19, TS strict, SQLite + Prisma 7
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
- [ ] T1.4 Verify `npm run build` + `npm run lint` pass clean; fix any break — 20 min
- [x] T1.5 Automated instead of manual: `npm test` — dependency-free `node:test` suite
      (`test/`) hits a real `next dev` server on an isolated `prisma/test.db`. 19 tests,
      all passing. Covers validation, sort/param allowlists, per-IP login rate limit,
      no user enumeration, reservation race guard (concurrent double-submit → exactly
      one row), and object-level authz. Also added `npm run bench` (dependency-free
      load benchmark). (Phase 10.1 / 7.4 / 7.5 / 8.3 / 16)
- [ ] T1.6 U7 UX-breaking bugs (fake contact form, list-media file input + validation,
      compare thumbnails, login shadow) — **product decision, confirm scope** — 2 h

### Tier 2 — infrastructural, cheap now / expensive later
- [x] T2.1 `PRE_DEPLOY_CHECKLIST.md` + `RUNBOOK.md` — 30 min
- [x] T2.2 `docs/AUDIT.md` 13-layer table — 30 min
- [ ] T2.3 DB backup script (`scripts/backup-db.sh` sqlite `.backup` + `npm run db:backup`)
      + one real test restore, documented (F13, Phase 9.7) — 40 min
- [ ] T2.4 Minimal structured logger (`lib/logger.ts`: JSON lines, level, reqId, route;
      rotating file in prod, console in dev) wired into `error.tsx` + route catch blocks
      + a short error reference ID shown to users (F12, Phase 4 + 5.3) — 2 h
- [ ] T2.5 `npm audit` — report by severity, patch what is safe (Phase 7.10) — 20 min
- [x] T2.6 Object-level authz — `/api/reservations/my` confirmed scoped by session
      (test: user B cannot see user A's reservation). Admin GET/POST confirmed to
      enforce role at the route, not just the UI. `/api/reviews` + admin `[id]` still
      worth a direct read. (F14, Phase 7.4)
- [ ] T2.7 `LICENSE` (MIT) + README pass: clean-machine setup steps, env var names,
      screenshots, architecture paragraph (Phase 14.1) — 1 h

### Tier 3 — fast wins, high value/minute
- [ ] T3.1 Reconcile doc row counts + `lib/data.ts` description across STATUS.md /
      project-reference.md / README (F8) — 20 min
- [ ] T3.2 Delete `project-ai.zip` from repo (regen via README zip cmd) — **needs user OK**
- [ ] T3.3 Responsive spot-check at 360/390/768/1280 on landing, explore, detail,
      dashboard; fix only hard breaks (horizontal scroll, unreachable buttons)
      (Phase 9) — 1.5 h
- [ ] T3.4 Confirm `AnalyticsTab` reads `/api/analytics` not `lib/data.ts` — 15 min

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
