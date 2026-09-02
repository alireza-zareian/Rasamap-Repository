# AUDIT — 13-Layer Production Stack Assessment

> Project: Rasamap (billboard marketplace). Level: bachelor capstone. Traffic: a few
> concurrent users at a live demo. Constraints: solo dev, ~5 days, Iran (no paid/
> region-blocked SaaS), demo runs locally or on a private server.
>
> Verdict key: **Required** = do it, a reviewer will notice its absence ·
> **Worth it** = real value for the effort, do if time allows ·
> **Overkill** = correct for a real product, not for this capstone (say so out loud).

| # | Layer | Has today | Missing | Verdict | Justification |
|---|-------|-----------|---------|---------|---------------|
| 1 | Front-end foundations | Next 16 App Router, React 19, RTL Persian, inline-CSS design system, `error.tsx` + `not-found.tsx`, loading states on some routes | Consistent empty/error/retry states on every list; mobile passes; some UX-breaking stubs (contact form, list-media file input) | **Required** (bug fixes + unhappy-path), **Worth it** (mobile) | It is the whole demo surface. Fix what visibly breaks; full redesign is out of scope. |
| 2 | APIs & backend logic | ~20 route handlers, Zod `.safeParse()` everywhere, allowlists for sort/filter, consistent Persian error payloads, rate-limit + auth ordering enforced | Structured request logging; a couple of stub endpoints | **Required** (keep the discipline), **Worth it** (logging) | Already strong. Logging is the main gap professors probe. |
| 3 | Database & storage | Prisma 7 schema, FKs, unique constraints (`slug`, `phone`, `review`), composite indexes matching query patterns, WAL mode, seed vs demo seed separated | Automated backup + tested restore; denormalised sort keys (`area`, `estimatedViews`) indexed | **Required** (backup + restore doc), **Worth it** (sort correctness) | "Do you have backups?" is a guaranteed question. SQLite `.backup` is one command. |
| 4 | Auth & permissions | JWT HttpOnly + SameSite=Strict cookies, bcrypt cost 12, timing-safe dummy hash, no user enumeration, `proxy.ts` guard, RBAC `viewer<editor<admin<super_admin` | Object-level authz spot-check; password reset flow (none exists) | **Required** (authz check), **Worth it** (reset), **Overkill** (email verification) | Being logged in ≠ authorised for a given row — must verify. No email service in Iran → reset is a stretch. |
| 5 | Hosting & deployment | Runs with `npm run build && npm start`; security headers + HSTS in `next.config.ts` | Deterministic documented deploy steps; env separation doc | **Required** | `PRE_DEPLOY_CHECKLIST.md` + `RUNBOOK.md` cover this. Cheap, expected. |
| 6 | Cloud & compute | Single Node process, single SQLite file | Nothing | **Overkill** | Capstone demo. No cloud compute needed; say so. |
| 7 | CI/CD & version control | **Not a git repo yet**; `.github/` folder present but unused | `git init`, `main` branch discipline, tag for presentation; CI only if tests exist | **Required** (git), **Overkill** (CI) | No history = no rollback and a bad portfolio look. CI has nothing to run — no test suite. |
| 8 | Security & row-level security | CSP + security headers, bot-UA blocking, input validation, ORM-only (no string SQL), per-user listing scoping, upload magic-byte validation, anti-scraping limits, `npm` lockfile committed | Per-user data-isolation spot-check across all `[id]` routes; `npm audit` run; `LICENSE` | **Required** | Change-an-ID test and a dependency audit are quick and high-signal. |
| 9 | Rate limiting | Sliding-window per-IP/per-user on login, register, public API, admin API; lockout + audit entry on breach | Persistence across restart (in-memory today) | **Required = already met**; persistence is **Overkill** | Single instance; a restart clearing counters is acceptable and disclosed. |
| 10 | Caching & CDN | `Cache-Control: max-age + stale-while-revalidate` on public billboard API; Next static optimisation; font preload | Response compression config; fragment/page caching; image WebP+resize | **Worth it** (compression, image resize), **Overkill** (CDN, cache server) | Next/Node gzip is basically free. A CDN for a demo is pointless. |
| 11 | Load balancing & scaling | None | Horizontal scaling, connection pooling beyond SQLite | **Overkill** | SQLite + single instance is a deliberate, defensible capstone choice. First bottleneck under load = single-writer lock on listing POSTs; name it, don't fix it. |
| 12 | Error tracking & logs | `console.error` guarded by `NODE_ENV`, in-memory audit ring buffer (500 entries) for admin actions | Structured JSON logs to a rotating file, request/error reference IDs surfaced to users, audit trail persisted | **Worth it** (self-hosted structured logs + reference ID), **Overkill** (Sentry/paid) | The in-code equivalent of error tracking. Directly answers an examiner question. |
| 13 | Availability & recovery | None documented | Backup schedule, restore procedure, rollback plan, uptime check | **Required** (backup + `RUNBOOK.md` rollback), **Overkill** (uptime monitor for a non-public demo) | Recovery story must exist on paper. External uptime pinging is moot if it is not public. |

## What was changed, by layer

- **L3 / L13 — recovery:** `RUNBOOK.md` + `PRE_DEPLOY_CHECKLIST.md` added. Backup script
  + tested restore: _pending (PLAN T2.3)._
- **L5 / L7 — deploy & git:** `.env.example` added; `.gitignore` hardened to exclude
  `*.db*`, archives and logs and to keep `.env.example`. `git init` + first commit:
  _pending user approval (PLAN T1.3)._
- **L8 — security:** `npm audit` + object-level authz spot-check: _pending (PLAN T2.5,
  T2.6)._ `LICENSE`: _pending (PLAN T2.7)._
- **L12 — logs:** minimal structured logger + user-facing error reference ID: _pending
  (PLAN T2.4)._
- **L1 / L2 — front-end & API:** "try to break it" pass + U7 bug fixes: _pending
  (PLAN T1.5, T1.6)._
- **Layers 6, 11:** consciously left empty — documented as Overkill above; to be stated
  in the presentation summary as deliberate, justified omissions.

_Last updated: 2026-09-01._
