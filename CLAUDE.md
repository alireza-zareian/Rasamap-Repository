@AGENTS.md

# Rasamap — Project Context

Iranian outdoor-media (billboard) marketplace. Persian UI, RTL (`dir="rtl"`), Vazirmatn font.

## Stack (one-liner per layer)

Next.js 16.2.11 App Router · React 19 · TypeScript 5 strict · SQLite via Prisma 7 + better-sqlite3 · JWT (jose) HttpOnly cookies · Inline CSS + Tailwind v4 (no Tailwind classes in JSX — inline style objects only) · Zod on all API inputs

## Critical Breaking Change: Next.js 16 Proxy

> Middleware was renamed to **Proxy** in Next.js 16.

- File: `proxy.ts` at project root (NOT `middleware.ts`)
- Export: `export function proxy(req)` or default export
- **Always read `node_modules/next/dist/docs/` before writing Next.js code.**

## Non-Negotiable Rules

1. Zod: always `.safeParse()`, never `.parse()`
2. API routes: use `getAllBillboards()` from `lib/db/billboards.ts` — never import `everyBillboard`/`allBillboards`/`scrapedBillboards` from `lib/data.ts`. Import domain **types** and `typeLabels` from `lib/types.ts` (data-free). `lib/data.ts` holds the static/scraped dataset + 4 MB JSON and is imported **only** by `prisma/seed.ts` at build time — importing it from client/page code ships the whole dataset to the browser.
3. Prisma 7: explicit driver adapter required — see `lib/db/client.ts`
4. No `JSON.parse(userInput)` — Zod handles parsing
5. Sort/filter values: always check against allowlists before use in queries
6. Auth failures: generic error messages only (no user enumeration)
7. Every admin route: session check → rate limit → Zod → business logic (in that order)

## Dev Commands

```bash
npm run demo    # ← build + start. USE THIS to view or demo the site.
npm run dev     # ONLY while writing code (hot-reload). 97× more CPU.
npm run build | lint
npm run db:migrate | db:seed | db:studio | db:dedupe | db:backfill-coords
```

> **🔴 Standing rule — say this out loud to the user whenever it is relevant.**
> `npm run dev` costs **9.7 s of CPU** for a first visit to ten routes;
> `npm run demo` costs **0.1 s** — measured on this project (§22 of
> `docs/engineering-decisions.md`). The demo runs on a fanless MacBook Air, so
> `dev` mode is what makes the laptop hot. The user *knows* this and still
> forgets it — **remind them** when they are browsing or presenting rather than
> coding. Any report, article or thesis text generated from this repo must carry
> the rule and the 97× figure.

Required env: `DATABASE_URL` · `AUTH_SECRET` · `ADMIN_EMAIL` · `ADMIN_PASSWORD_HASH` · `ADMIN_NAME` · `NESHAN_API_KEY`

## Roadmap Tracking (always do this)

After completing any task, update `docs/roadmap.html`:
- Completed task: change `class="task todo-t"` → `class="task done-t"` and `<div class="tick"></div>` → `<div class="tick">✓</div>`
- Phase fully done: change `class="phase-card is-next"` → `class="phase-card is-done"`, badge text to `✓ تموم شده`, add `<div class="proof">` with what was verified
- Next phase in progress: add `is-next open` class, badge to `→ در جریان`
- Update the footer date to today's date in Jalali (شمسی)

## Production Audit — Standing Rules

Condensed from `PRODUCTION_AUDIT.md` §0, §5, §8. Full 12-phase workflow: run `/prod-audit`.
Triage and status live in `PLAN.md`; 13-layer assessment in `docs/AUDIT.md`.

### §0 — How to work
- Persian for every explanation, question, report, summary. English for everything **inside**
  the repo: code, identifiers, comments, docstrings, commit messages, file names, docs.
- Context: solo dev, bachelor capstone, ~5-day deadline. Goal = a working, clean, safe,
  professional project that survives a live demo — not exotic infrastructure.
- No paid or region-blocked SaaS, ever (Sentry, PostHog, Supabase, Clerk, Auth0, Neon, AWS,
  paid Vercel/Cloudflare, paid CDN/monitoring). Only the current stack, free self-hostable
  OSS, offline tools, and plain code. If a best practice needs a paid service, build the
  in-code equivalent or skip it and say in one line what is lost.
- Judge every item **Required / Worth it / Overkill** before building. Implement only
  Required + Worth it. Never implement a list blindly.
- Check existing code first — if it is already done, say "already implemented" and move on.
  No duplication, no re-inventing, no replacing a working solution with a preferred one.
- No invented features, no behaviour changes, no TODO stubs / dead branches / half-finished
  code. Only report something done if you ran it and saw it work.
- Work continuously; stop and ask only when: (a) destructive/irreversible — deleting files,
  dropping tables/data, rewriting git history, mass rename; (b) two valid options change the
  product meaningfully; (c) something will not fit the 5-day budget.
- Commit in small steps with clear English messages. Never mix a refactor and a behaviour
  change in one commit.

### §5 — Error handling everywhere
- A user must never see a blank screen, a raw stack trace, or a bare generic 500. Neither of
  us should ever be unable to tell why something failed.
- Handle errors at each layer (validation, handlers, services, DB, file I/O, external calls,
  client fetch/render). Catch what you can handle; let the rest reach a global handler. No
  blind catch-all that swallows errors.
- Styled Persian pages for 400/403/404/500 + a client error boundary. Show the user a calm
  message + a short reference ID. Traceback and internals go to logs only.
- Never leak internals in a message: no stack, SQL, file paths, versions, config values.
- Build the unhappy path: loading, empty ("no data yet" is a designed screen), failure +
  retry, disabled in-flight buttons, timeout/offline, a message per validation error.
- Every outbound call: timeout + bounded retry where safe + a defined fallback.

### §8 — Concurrency, abuse, correctness under load
- **Idempotency:** a repeated identical request must not repeat its effect. Protect
  non-idempotent POSTs with a DB unique constraint / idempotency key / get-or-create in a
  transaction, plus a disabled button and client de-dup.
- **Atomicity:** any op touching >1 row/table runs in a transaction — all or nothing.
- **Race conditions:** every read-modify-write (counters, review aggregates,
  "check then insert") is fixed with an atomic DB update, a row lock in a transaction, or a
  unique constraint. Never bare check-then-write.
- **Duplicates:** defined at the DB level (unique constraint + explicit conflict handling),
  not only in app code.
- **Rate limiting:** per-IP and per-user on login, register, password reset, OTP/email,
  search, and every expensive or write-heavy endpoint.
- **Brute force:** progressive delay + temporary lockout per account and per IP, each
  lockout logged. Same on OTP / reset flows.
- **Mass-user resilience:** persistent/pooled DB connections, pagination everywhere, bounded
  result sizes, no unbounded record loops, background/queued work for slow tasks, bulk
  insert/update over row-at-a-time.

## Architecture explanation is mandatory in reviewer-facing reports

Any HTML report / slide / summary produced for the thesis reviewers **must** include
the "two data paths" explanation and the restaurant/kitchen analogy from
`docs/architecture.md` (adapted to tone). "Why doesn't every page call the API?" is the
first question a Next.js app draws. Never frame the Server-Component-reads-the-DB path
as a shortcut or a gap — it is the framework's recommended pattern and the faster choice.

## Read When Relevant (not always)

- `docs/architecture.md` — the two data paths, kitchen analogy, perf comparison, why it differs from a headless DRF API
- `docs/api.md` — full HTTP API reference (~28 endpoints, method / auth / params)
- `docs/engineering-decisions.md` — 21 decision records + milestone log (the "what we built and why" spine; §7a = why no Docker/ELK yet, §16 = SMS built-but-dormant, §17 = why there is no booking flow, §18 = monetisation without a gateway, §19 = upload hardening, §20 = anti-scraping, §21 = denormalised sort keys)
- `docs/final-review-notes.md` — **read this first when writing the thesis/report**: what the final review changed and why, defense Q&A, remaining weak spots, numbers to quote
- `docs/presentation-prep.md` — checklist for building the thesis document / defense: screenshots to take, live checks, talking points, doc map
- `docs/self-assessment.md` — internal rubric score (A−) with honest weak spots
- `docs/project-reference.md` — file map, data flow, schema, auth, types, phase roadmap, stubs, known issues
- `docs/api-patterns.md` — exact API route pattern + admin pattern template
- `PLAN.md` · `docs/AUDIT.md` · `PRE_DEPLOY_CHECKLIST.md` · `RUNBOOK.md` — production-readiness triage and ops
