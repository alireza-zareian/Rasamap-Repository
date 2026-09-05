---
description: Run the full production-readiness & final-sprint audit (12 phases)
---

# MASTER PROMPT — PRODUCTION READINESS & FINAL SPRINT AUDIT

## 0. HOW TO WORK

0.1 Talk to me in Persian (Farsi) — every explanation, question, report and summary.
Everything you write inside the project stays in English: code, identifiers, comments,
docstrings, commit messages, file names, and documentation files.

0.2 Context: I am a solo developer. This is my final-year bachelor capstone project.
I have to hand it to my professors in about 5 days. What matters is a working, clean,
safe, professional project that survives a live demo and honest questions — not exotic
infrastructure.

0.3 I am in Iran. I cannot pay for or reach most foreign SaaS. Never propose or add
anything that requires a paid or region-blocked service (Sentry, PostHog, BetterStack,
Supabase, Clerk, Auth0, Neon, AWS, paid Vercel/Cloudflare tiers, paid CDNs, paid
monitoring). Allowed: what is already in my stack, free open-source software I can run
locally or on my own server, offline tools, and plain code I own. When a standard best
practice normally depends on a paid service, implement the self-hosted or in-code
equivalent instead. If no free equivalent exists, skip it and tell me in one line what
I am giving up.

0.4 Judge before you build. For every item in this document, first decide whether it is
actually justified for this project's level, size and expected traffic. Mark each one
**Required / Worth it / Overkill** with a one-line reason. Implement only Required and
Worth it. Never implement the whole list blindly.

0.5 Check before you implement. Read the existing code first. If something is already
implemented, say "already implemented" and move on. Do not duplicate, do not re-invent,
and do not replace a working solution with your preferred one.

0.6 Do not invent features, do not change product behaviour, do not leave TODO stubs,
dead branches or half-finished code. Anything you report as done must have been actually
run and observed working.

0.7 Work through the phases below in order, continuously, without asking me to confirm
each step. Stop and ask me only when: (a) the action is destructive or hard to reverse —
deleting files, dropping tables or data, rewriting git history, mass renaming; (b) two
valid options would change the product meaningfully; (c) you discover something that will
not fit in the 5-day budget.

0.8 After each phase: run the app, run whatever tests exist, confirm that nothing that
worked before is broken, then give me a short Persian report — what changed, why, what
risk remains, and what you deliberately skipped.

0.9 Commit in small, meaningful steps with clear English messages. Never bundle a
refactor and a behaviour change into the same commit.

## 1. PHASE 0 — READ THE STATE BEFORE TOUCHING ANYTHING

1.1 Open `docs/STATUS.md` and `docs/roadmap.html` (the repo equivalents of Status.md /
Roadmap.html) and list every piece of practical work still marked unfinished.

1.2 Regardless of what those files say, read this entire prompt first, then read the
codebase itself: entry points, settings/config, models and schema, routes/URLs,
views/controllers, services, templates/components, static assets, tests, deployment
files and dependency files.

1.3 Produce a written triage in `docs/STATUS.md` before writing a single line of code. It must
contain: (a) a one-page description of what this project actually is — its stack, its
real scale, its user model — as you understand it from the code; (b) everything still
remaining from Status/Roadmap; (c) everything you found yourself that is missing or
wrong; (d) a priority ranking.

1.4 Rank by these rules, in this order: **first**, anything that blocks the demo or would
embarrass me in front of the professors; **second**, anything infrastructural — decisions
that are cheap now and expensive later, and things that other work depends on; **third**,
fast wins with the highest value per minute. Put a time estimate next to each item and
mark the ones that will not fit into 5 days.

1.5 Show me `docs/STATUS.md`, then start executing immediately in that order. Do not wait for my
approval unless rule 0.7 applies. Keep `docs/STATUS.md` updated with checkboxes as you go.

## 2. PHASE 0.5 — LEVEL ASSESSMENT (do once, write into `docs/STATUS.md`)

2.1 A full production stack is usually described as 13 layers: (1) front-end foundations,
(2) APIs and backend logic, (3) database and storage, (4) auth and permissions,
(5) hosting and deployment, (6) cloud and compute, (7) CI/CD and version control,
(8) security and row-level security, (9) rate limiting, (10) caching and CDN,
(11) load balancing and scaling, (12) error tracking and logs, (13) availability and
recovery. Most small projects have two or three of them and are missing the other ten —
and those ten are what separate a demo from a real product.

2.2 For each of those 13 layers write: what my project currently has, what is missing,
and a verdict — Required / Worth it / Overkill for a capstone project of this level —
with one line of justification. Then implement only what you marked Required or Worth it,
following the priority rules in 1.4.

2.3 Be honest and specific. The point of this exercise is to know exactly which of the
missing layers actually matter here, not to check boxes.

## 3. PHASE 1 — PROJECT STRUCTURE

3.1 You previously suggested moving some files so the structure looks more professional.
Decide whether that is still worth doing given the deadline. If yes, do it now, before
the code cleanup, because everything else builds on top of it.

3.2 When you move or rename anything, update every single reference: imports, URL/route
definitions, template and component paths, static and media paths, config keys, test
paths, documentation, and any string-based dynamic import or path.

3.3 After the move, run the whole app and exercise every page and endpoint. A structure
refactor that leaves one broken import is worse than no refactor at all. If you cannot
verify a path, say so instead of assuming.

3.4 Aim for a layout a reviewer immediately recognises: clear separation of config,
domain/app code, shared utilities, templates/UI, static assets, tests, scripts and docs.
No orphan files at the repo root, no `misc`/`temp`/`new_final_v2` folders.

## 4. PHASE 2 — CODE CLEANUP

4.1 Work in this exact order, and never jump to the later steps first: (a) write down the
requirement each piece of code exists for; (b) delete the part or the process step — if
you are not deleting things at least sometimes, you are not deleting enough; (c) only then
simplify or optimise what remains; (d) only then make it faster; (e) only then automate
it. The most common mistake of a smart engineer is optimising something that should not
exist at all.

4.2 Delete dead code: unused functions, classes, imports, variables, routes, templates,
CSS rules, assets, commented-out blocks, unreachable branches, abandoned experiments and
duplicate files.

4.3 Collapse duplication: the same logic repeated in several places becomes one
well-named function/component/utility used everywhere.

4.4 Simplify what is needlessly long or convoluted while keeping the exact same
behaviour. The result must be more readable to a human, not more clever. Do not compress
readable code into dense one-liners, and do not introduce a design pattern where a plain
function is enough.

4.5 Make naming consistent and self-explanatory across the whole project. Consistent
formatting, lint clean.

4.6 Every cleanup step must preserve behaviour. If you are not certain a piece of code is
dead, do not guess — list it and let me decide.

## 5. PHASE 3 — ERROR HANDLING AND EXCEPTION HANDLING EVERYWHERE

5.1 The rule: a user must never see a blank white screen, a raw stack trace, or a
meaningless generic 500. And I must never end up in a situation where neither the user
nor I know why something failed.

5.2 Add error handling at every level where it belongs — form validation, request
handlers, service functions, database access, file I/O, external calls, background jobs,
front-end fetches and rendering. Do not wrap everything in a blind catch-all that
swallows errors silently; catch what you can actually handle, and let the rest reach the
global handler.

5.3 Add a global catch-all handler plus custom, styled error pages for 400, 403, 404 and
500, and the front-end equivalent (an error boundary or global handler on the client
side). The user gets a calm, human message in the project's language plus a short error
reference ID. The details, traceback and internals go to the log, never to the screen.

5.4 Never leak internals in an error message: no stack traces, no SQL, no file paths, no
library versions, no config values. Generic on the outside, detailed on the inside — a
malicious user must not be able to map my system from my error output.

5.5 Build the unhappy path in the UI, not just the happy path: loading states, empty
states ("no data yet" is a designed screen, not a blank area), failure states with a
retry, disabled/in-flight buttons, timeout and offline behaviour, and a clear message for
every validation error.

5.6 Every outbound/external call gets a timeout, a bounded retry where retrying is safe,
and a defined fallback for when it fails.

## 6. PHASE 4 — LOGGING AND OBSERVABILITY

6.1 First decide, with reasons, whether real logging is justified at this project's level
and for this kind of site. If it is — and it usually is, because professors ask about it —
implement it with free tooling already available in my stack. Do not add a paid service.

6.2 Structured logs, not scattered `print`/`console.log`: timestamp, level, logger name,
message, request ID, user ID (or anonymous), route, and the exception with traceback for
errors.

6.3 Meaningful log levels: DEBUG for development detail, INFO for normal significant
operations, WARNING for recoverable anomalies, ERROR for things that broke, CRITICAL for
things that take the system down.

6.4 Centralised configuration in one place, writing to rotating files (plus console in
development), so logs are searchable after the fact and do not fill the disk.

6.5 Never log secrets, passwords, tokens, full card or ID numbers, or unnecessary
personal data.

6.6 Audit trail for sensitive actions: who did what, and when — permission and role
changes, account and email changes, deletions, payments or plan changes if any, admin
actions.

6.7 Remove leftover debug prints from the codebase as part of this phase.

## 7. PHASE 5 — SECURITY

7.1 Secrets: no API key, password, token or secret key anywhere in the code or in the
repository. Everything from environment variables or a git-ignored local `.env`, with a
committed `.env.example` that lists only the names. Check the git history too — if a
secret was ever committed, stop and tell me; rotating it is my job and cleaning history
is a decision I must approve.

7.2 Debug off in production, allowed hosts restricted, secure and HTTP-only cookies, CSRF
protection on every state-changing request, security headers set, HTTPS-only settings
where applicable.

7.3 Input validation and sanitisation on every input field, on the server side — never
trust the client. Escape output. Confirm there is no SQL injection surface (parameterised
queries or ORM only, never string-built SQL) and no XSS surface (no unescaped
user-supplied HTML).

7.4 Object-level authorisation. Every record fetched by ID must be checked against
ownership or permission. Test it yourself: change an ID in a URL or a request body and
see whether you get someone else's data. Prefer non-guessable identifiers (UUIDs) for
anything user-facing and sensitive.

7.5 Enforce access control at the API/server layer, not the UI layer. Hiding a button is
convenience; the endpoint is the security boundary.

7.6 Roles and permissions: model permissions first and let roles be collections of
permissions, and add scope — can this user act on any record, or only on their own.
Start with the smallest role set that covers my real use cases. Use my framework's
built-in permission system rather than hand-rolled boolean flags scattered through the
code.

7.7 Auth: do not rewrite authentication from scratch. Use the battle-tested
implementation that already ships with my framework and verify: password hashing,
session/token handling and expiry, session invalidation on logout, password reset tokens
that are single-use and expire within about 30 minutes, email verification if the flow
needs it, and no user enumeration in login or reset responses. Also confirm sessions
cannot collide or leak across concurrent users.

7.8 CORS restricted to the domains I actually use; no wildcard in production.

7.9 File uploads, if any: validate type, extension, size and actual content; store
outside the executable path; never trust the client-supplied filename.

7.10 Dependency audit: run the audit command for my package manager, report
vulnerabilities by severity, update what is safe to update, and flag what is not. Make
sure the lock file exists, is committed and pins versions. Add a note in the docs to
repeat this audit monthly.

7.11 Then walk the standard pre-launch security checklist for a project like mine — auth,
encryption, session handling, error boundaries, rate limiting, input validation, logging,
backups, monitoring, dependency scanning — decide which items apply here, and close the
ones that do.

## 8. PHASE 6 — CONCURRENCY, ABUSE AND CORRECTNESS UNDER LOAD

8.1 **Idempotency.** A repeated identical request must not produce a repeated effect.
GET/PUT/DELETE must be idempotent by design. For non-idempotent operations (a POST that
creates or charges something), protect against double submission with a database-level
unique constraint, an idempotency key, a get-or-create inside a transaction, plus a
disabled button and request de-duplication on the client.

8.2 **Atomicity.** Any operation touching more than one row or table runs inside a
transaction and either fully succeeds or fully rolls back.

8.3 **Race conditions.** Find every read-modify-write sequence — counters, balances,
stock, streaks, scores, seat or slot booking, "check then insert" — and fix it with
database-level atomic updates, row locking inside a transaction, or a unique constraint.
Never rely on "check first, then write" without a lock or a constraint.

8.4 **Duplicate handling.** Define what happens on a duplicate at the database level, not
only in application code — unique constraints plus explicit conflict handling.

8.5 **Rate limiting and throttling.** Per-IP and per-user limits on the endpoints that
matter: login, registration, password reset, OTP/email sending, search, and any
expensive or write-heavy endpoint.

8.6 **Brute force protection.** Progressive delays and temporary lockout after repeated
failed logins, per account and per IP, with each lockout written to the log. The same
protection on OTP and password reset flows.

8.7 **Mass-user resilience.** Connection pooling or persistent database connections;
pagination everywhere a list can grow; bounded query result sizes; no unbounded loops
over records; background or queued processing for anything slow; bulk inserts/updates
instead of writing rows one at a time.

8.8 If it fits the time budget, run a small free load test with an open-source tool,
simulating roughly 50-200 concurrent users, find the first bottleneck and fix it. If it
does not fit the budget, at least tell me exactly where you expect it to break first.

## 9. PHASE 7 — DATABASE, AT AN ELITE LEVEL

9.1 Review the schema the way a database professional would: correct normalisation with
deliberate exceptions, correct data types and lengths, NOT NULL where a value is truly
required, sensible defaults, foreign keys with a deliberate delete behaviour, unique
constraints on everything that must be unique, check constraints for real invariants, and
no orphaned or unused tables and columns.

9.2 **Indexes:** add them on the fields that real, high-traffic queries filter, join and
sort on — including composite indexes with the column order that matches the actual query
patterns. Do not index everything. Justify each index by the query it serves, and drop
indexes nothing uses.

9.3 **Query review, one query at a time.** Check join order and strategy; conditions
pushed into the JOIN where that shrinks the joined set; field selection consolidated so
one query fetches everything needed; no `SELECT *` where a few columns are enough;
aggregation done in the database rather than in an application loop.

9.4 **Kill the N+1 problem everywhere.** Find every place where a loop triggers one query
per iteration and replace it with eager-loading / join / prefetch. Count queries per page
before and after, and report the numbers.

9.5 Run EXPLAIN / ANALYZE on the heaviest queries, report what the planner actually does,
and confirm the indexes are really being used. Specifically audit the queries whose cost
grows with data volume.

9.6 **Migrations:** consistent and ordered, reversible where possible, no conflicting or
duplicated history, and safe to run against a database that already contains data.

9.7 **Backups:** an automated, scheduled dump of the database with a documented restore
procedure — and actually perform a test restore once.

9.8 Keep seed/demo data for the presentation clearly separate from real data.

## 10. PHASE 8 — PERFORMANCE

10.1 Decide which of these actually apply at my scale before doing any of them.

10.2 Compress responses over the wire (gzip/brotli).

10.3 **Caching:** cache what is requested repeatedly and does not change every second.
Use a free option: my framework's built-in cache backend, or a locally installed
open-source in-memory cache server. Define exactly what is cached, for how long, and how
it is invalidated. Never write user-specific data into a shared cache key.

10.4 Do not rebuild the same HTML for every visitor when the output is identical — cache
or pre-render it.

10.5 Front end: show immediate feedback and reconcile with the response where an
optimistic update is safe.

10.6 Find the single dominant bottleneck instead of micro-optimising: measure end-to-end
time for the slowest few pages and actions, break it into its parts.

10.7 **Images and assets:** convert images to WebP, resize them down to the maximum size
they are actually displayed at, compress them, add explicit width/height and lazy
loading. Minify and bundle CSS/JS, remove unused CSS.

10.8 Pagination and hard limits on every list that can grow.

## 11. PHASE 9 — RESPONSIVE AND CROSS-DEVICE

11.1 The site must be genuinely usable on a phone.

11.2 Check and fix the layout at minimum at 360px, 390px, 768px, 1280px and 1920px
widths: no horizontal scrolling, no overflowing tables or images, no overlapping or
clipped text, no unreachable buttons.

11.3 Touch targets large enough, forms usable with a mobile keyboard, correct input
types, modals and menus usable on small screens, sticky headers not eating half the
viewport.

11.4 If the UI is Persian/RTL, verify direction, alignment, numerals, fonts, icons and
mirrored layout are all correct at every breakpoint.

11.5 Verify this in a real browser at those sizes and report what you actually saw.

## 12. PHASE 10 — TURNING A DEMO INTO A PRODUCT

12.1 Try to break it on purpose, and fix what breaks: submit an empty form; paste 10,000
characters into a text field; press submit 47 times; upload wrong file types and
oversized files; omit required fields; send malformed data straight to an endpoint
bypassing the UI; change a price, a quantity, a user ID or a role in the request before
it reaches the backend; call an endpoint the interface was never meant to expose; open it
on a phone. Report each attempt and its result.

12.2 The rule: stop asking only "does it work?" and start asking "how can I make it
fail?".

12.3 Add the boring things that separate a product from a demo: real error messages,
loading states, empty states, confirmation dialogs before destructive actions, password
reset, a sensible 404, consistent page titles, a favicon, and a first-run experience a
stranger can understand in 30 seconds.

12.4 Walk the main user journeys end to end as if you were a brand-new user who was never
told how the app works, and report anything confusing.

## 13. PHASE 11 — ENVIRONMENTS, GIT AND DEPLOYMENT

13.1 Separate configuration per environment: development and production must not share the
same database, secret key, debug flag or credentials. At minimum, one config layer driven
by environment variables, with safe defaults for development and strict values for
production. A full third staging environment is probably overkill here — say so if you
agree.

13.2 Git strategy: `main` is the production branch and is always in a working state;
feature and fix work happens on short-lived branches and merges in only when it works.

13.3 `.gitignore` covering environment files, local databases, caches, build output,
virtual environments, IDE files, uploaded media and logs. Verify that nothing sensitive
or huge is already tracked.

13.4 Make deployment deterministic and documented: an exact, ordered, repeatable
procedure — ideally a script — covering dependency install, environment variables,
migrations, static file collection and service restart. If free CI is available and you
judge it worth the time, set up a minimal pipeline that installs dependencies and runs
the tests on every push.

13.5 A rollback plan: how do I get back to the previous working version in under two
minutes, and where exactly is that written down.

13.6 Write `RUNBOOK.md` — the exact things to verify before every deploy:
debug off, secrets loaded from the environment and not hardcoded, migrations applied,
static files built, error pages working, rate limits active, backups running, tests
passing, rollback ready.

13.7 Write `RUNBOOK.md` — one page: if the app is down or broken, what do I check first,
second, third, and how do I roll back.

13.8 If and only if this project will actually be publicly deployed on a real domain, add
the cheap essentials: `robots.txt`, `sitemap.xml`, correct page titles and meta
descriptions, Open Graph tags, and a free uptime check. If it will only be demonstrated
locally or on a private server, skip all of that and tell me you skipped it.

## 14. PHASE 12 — PUBLISHING TO GITHUB

14.1 Prepare the repository for a portfolio audience: a real `README.md` with what the
project is, screenshots, the stack, the main features, the architecture in a few lines,
setup and run instructions that genuinely work from a clean machine, and the required
environment variables (names only). Add a `LICENSE`. Add `.env.example`.

14.2 Verify that no secrets, no personal data, no large binaries and no local database
file are in the repository or in its history. If any are, stop and tell me before
touching the history.

14.3 Give me the exact commands to create the repository and push it, with a clean commit
history and a tag for the presentation version.

14.4 The commit history is part of what reviewers see. From here on: no `asdf`, no bare
`fix`, no single 400-file commit if it can reasonably be avoided.

## 15. EXPLICITLY PROBABLY OUT OF SCOPE — CONFIRM OR CHALLENGE

15.1 For each of the following, either confirm "not needed here, because..." or tell me it
genuinely is needed here and implement it: multi-tenancy with a tenant ID on every table
and row-level security; read replicas; load balancing and horizontal autoscaling; a CDN;
container orchestration; API versioning with a public changelog and deprecation policy; a
formal GDPR-style data-deletion pipeline and consent management; cyber liability insurance
and terms-of-service/privacy legal review; paid third-party monitoring, analytics and
error-tracking platforms; SEO keyword strategy and search-console work; domain,
subdomain, email authentication records (SPF/DKIM/DMARC) and payment gateway setup.

15.2 Where one of these is genuinely relevant in a small form, implement only the small
form: strict per-user data isolation enforced in every query instead of full
multi-tenancy; a short honest privacy note plus a working account and data deletion path
instead of a compliance programme; my own structured logs and audit trail instead of a
paid error-tracking platform.

## 16. TIME BUDGET AND HONESTY

16.1 I have about 5 days. Priority beats completeness. If the full list will not fit, tell
me immediately and re-rank, rather than silently leaving things half-done.

16.2 Never report something as done that you have not verified by running it. If you could
not verify something, say exactly that.

16.3 If you disagree with an instruction in this document for this specific project, say
so in one or two lines, then proceed as instructed unless I tell you otherwise.

## 17. DELIVERABLES

17.1 `docs/STATUS.md` — the triage and prioritised, checkbox-tracked task list.
17.2 `docs/STATUS.md` — the 13-layer assessment table with verdicts and justifications,
plus what you changed for each layer.
17.3 `RUNBOOK.md` and `RUNBOOK.md`.
17.4 An updated `README.md` and `.env.example`.
17.5 A final summary in Persian for the presentation: what the project is, the
architecture, which production concerns were addressed and how, what was deliberately left
out and why, and the honest known limitations.

## 18. START NOW

18.1 Begin with Phase 0: read `docs/STATUS.md` and `docs/roadmap.html`, read the
codebase, update `docs/STATUS.md` and `docs/STATUS.md`, show me the prioritised list in Persian,
and then execute straight through the phases without waiting for me — stopping only under
rule 0.7.

---

## PROJECT-SPECIFIC NOTES (Rasamap — read before running the phases)

- **Stack reality:** Next.js 16.2.11 App Router, React 19, TypeScript strict, SQLite +
  Prisma 7 (`better-sqlite3` adapter, WAL mode), JWT HttpOnly cookies (jose), Leaflet.
  Single instance, single SQLite file. No test suite exists.
- **Scale reality:** ~2800-3500 billboard rows, read-heavy, a handful of concurrent
  users during the demo. Not a high-traffic product.
- **Already done — do NOT redo (confirm, then move on):** security headers + CSP
  (`next.config.ts`), auth guard (`proxy.ts`), sliding-window rate limiting
  (`lib/auth/rate-limit.ts`), RBAC (`lib/auth/users.ts`), bcrypt cost 12 + timing-safe
  dummy hash, Zod `.safeParse()` on every route, allowlists for sort/filter, styled
  Persian `app/error.tsx` + `app/not-found.tsx`, `app/robots.ts` + `app/sitemap.ts`,
  server-side pagination on `/api/billboards`, composite DB indexes, reservation overlap
  check already wrapped in a `prisma.$transaction`, in-memory audit log
  (`lib/auth/audit.ts`).
- **Hard constraints (never violate):** Zod `.safeParse()` only; admin route order
  `session -> rate limit -> Zod -> business logic`; DB reads via `lib/db/billboards.ts`
  never `lib/data.ts`; all user-visible strings in Persian; styling is inline
  `style={{}}` only, no Tailwind classes in JSX; `proxy.ts` not `middleware.ts`.
- **Deferred by decision (out of scope for this audit):** scraper/geocoding pipeline,
  switching away from SQLite, guest checkout, map provider comparison (MAP-A..D in
  `docs/STATUS.md`).
- **After finishing a phase:** update `docs/roadmap.html` per the rules in `CLAUDE.md`
  and bump the footer date to today in Jalali.
