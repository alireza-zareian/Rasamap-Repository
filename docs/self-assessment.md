# Internal self-assessment

> A candid rubric score, written for the thesis document's evaluation chapter.
> Not marketing — the weak spots are listed on purpose so the defense isn't
> ambushed by them. Scale: A (excellent for a capstone) → C (acceptable) → D
> (a real gap).

Overall: **A−**

| Axis | Grade | Evidence | Honest caveat |
|------|-------|----------|---------------|
| **Requirements coverage** | A− | Search, filter, map, compare, detail, reviews, online booking with real overlap handling, user auth, a full admin panel (billboards CRUD, reservations, quality, scraper, users, audit), an in-app API reference. | The scraper/geocoding pipeline is deferred (documented) — the dataset is seeded, not live-refreshed. |
| **Architecture** | A | One data layer (`lib/db/`), the framework's two entry paths used correctly (RSC reads the DB, client code calls the API), a fixed request pipeline on every route, `proxy.ts` as the single auth boundary. `docs/architecture.md` + `docs/engineering-decisions.md` §1–2. | The public-facing bundle once shipped the whole 4 MB dataset — a real bug, found and fixed (`lib/types.ts` split, 7.7 → 1.0 MB). Good that it was caught; notable that it happened. |
| **Database design** | A− | Normalised schema, explicit PKs, composite indexes on the real query shapes `(city,status)` / `(city,type)` / `(type,price)`, WAL mode + `synchronous=NORMAL`, JSON columns only where SQLite has no array type. Prisma migrations, hand-written where the AI guard blocks `migrate dev`. | SQLite, not a client/server RDBMS. Defensible (see §14) and the path to Postgres is a connection string, but a reviewer may still want more. Arrays-as-JSON is a modelling compromise. |
| **Concurrency & correctness** | A | The reservation race is closed two ways: an atomic overlap check inside a `$transaction` **and** a DB unique constraint; test fires 10 concurrent identical requests and asserts exactly one row. Idempotency-Key support. Confirming a reservation flips the billboard status in the same transaction. | Rate limiting is in-memory (single instance) — correct for the deployment, would need Redis for multi-instance; this is stated in the code and docs. |
| **Security** | A | Endpoint-not-UI boundary, RBAC `viewer<editor<admin<super_admin`, JWT HS256 in an HttpOnly SameSite=Strict cookie, bcrypt cost 12 + timing-safe login, Zod `.safeParse()` on every input with sort/filter allowlists, non-spoofable client IP, per-IP + per-user rate limits with humane lockouts, a durable audit log for every admin mutation, fail-closed env validation at boot, generic auth errors (no user enumeration), owner phone numbers behind auth. `npm audit` reviewed, `next` CVEs patched. | No WAF / CAPTCHA / hosted error tracking — out of scope for a self-hostable, no-paid-service project, and the reasoning is documented (§7a). |
| **Error handling & UX** | A− | Styled Persian 400/403/404/500 pages + a client error boundary, a short reference id on every unexpected 500 (shown to the user, logged with the stack), designed empty/loading/failure states, disabled in-flight buttons, a "try again in N minutes" message on rate-limit. | A few flows still surface a raw server 409 as the first signal (the booking clash guard now pre-empts the main one). |
| **Observability** | A− | One JSON object per log line, one `api_request` per request, `withApiLog` on every route, audit lines routed through the same logger, optional rotated file via `LOG_DIR`. §7 + §7a explain the deliberate stop point and the path forward. | No dashboards/alerting — that's the deployment layer, and the format is built for it, but it isn't wired. |
| **Testing** | B+ | 57 dependency-free API tests (`node:test` + `fetch` against a real dev server on an isolated DB): validation, allowlists, rate limits, no-enumeration, the race guard, object-level authz, the OTP reset flow, the reservation status flip. `npm run bench` for load. | API-level only — no component/unit tests, no E2E browser suite. Reasonable for the scope and timeline; worth naming as future work. |
| **Code quality** | A− | Consistent structure across ~28 routes, single-responsibility modules, `0` lint warnings, no `TODO`/`FIXME`/`@ts-ignore` in the codebase, TypeScript strict. Inline-style rule inflates line counts but that's a deliberate design-system choice. | `page.tsx` files are large (600+ lines) because of inline styles; the admin billboards list was loading all rows and filtering in JS until this pass (now DB-side); one O(n²) stat was replaced with O(n). |
| **Documentation** | A | `docs/` carries architecture, ~28-endpoint API reference, 16 decision records with a milestone log, a security audit, a production-readiness triage, demo-account sheet, and this prep checklist. README is a readable narrative, not a command dump. | — |

## Where a stricter grader would push

1. **SQLite** — have §14 and the "config not rewrite" argument ready.
2. **In-memory rate limiter** — single-instance only; the Redis path is noted.
3. **No browser/E2E tests** — API coverage is strong, UI coverage is manual.
4. **Scraper deferred** — the live data pipeline exists in `scraper/` but isn't
   part of the running system; the dataset is a seed.
5. **The bundle-leak bug** — own it: it was found by measuring, not by luck, and
   fixed structurally.
