# Test suite

Dependency-free API integration tests. No Jest/Vitest — just Node's built-in
`node:test` runner + `fetch` against a real **production** server backed by an
isolated SQLite database (`prisma/test.db`, git-ignored, never `dev.db`).

## Run

```bash
npm test          # unit tests -> reset test db -> seed -> next build -> server.mjs on :3100 -> API + importer tests -> stop
npm run test:unit # the pure rules in lib/domain and the source guards: no build, no server, ~0.5 s
```

209 tests — 18 unit tests of the pure rules and the source guards (`test/unit/`),
183 API tests, 8 covering the nightly importer — in about a minute end to end. `npm test` is fully self-contained. It sets its own env (`AUTH_SECRET`,
`DATABASE_URL=file:./prisma/test.db`, dummy admin/Neshan vars) which override
any `.env*` file, so it never reads or writes the development database.

### Why a production build and not `next dev`

`next dev` recompiles a route on every request (§22 of
`docs/engineering-decisions.md`: ~97x the CPU of a built server). The 120-read
loop in *"reading is not rate limited the way writing is"* was slow enough
under dev that one request passed undici's 300-second header timeout; the
server wedged and the last ~20 tests failed for no reason of their own. The
one-off `next build` costs about a minute and the suite then runs against the
same output that ships. Two guards keep a stall legible: the build goes to
`.next-test/` so it never disturbs the `.next` that `npm run demo` serves, and
`test/helpers.mjs` aborts any single request after 30 seconds.

Helper scripts (rarely needed on their own):

```bash
npm run test:reset   # recreate prisma/test.db from the migrations (migrate deploy, not db push)
npm run test:seed    # load fixtures: billboards, customers (password "secret123"), one staff row per role
```

### Unit tests

`test/unit/*.test.mjs` import `lib/domain/*.ts` straight into Node, which strips
the TypeScript types on load. That works because `lib/domain` has no I/O by
construction — ESLint refuses any database, framework or `node:` import there —
so a rule of the product (a listing's state transitions, a derived price, a
JSON column's shape) is tested without building anything. Two files read source
rather than rules: `cities.test.mjs` checks that every city the dataset names is
one the catalogue knows, and `css-modules.test.mjs` that every animation a CSS
module names is defined in that module.

## What is covered

| Area | Checks |
|------|--------|
| Public billboards API | pagination shape; rejects values outside the sort allowlist; rejects oversized `limit`; rejects unknown `type` |
| Register / login | short password 400; non-Iranian phone 400; happy path sets session cookie; wrong-password vs unknown-user return an **identical** 401 (no user enumeration); an unknown phone takes **comparable time** to a wrong password (no timing oracle — verified to fail when the padding hash is broken); login is rate-limited per IP (429) |
| Listings pipeline | 401 without a session; a submission is invisible publicly until approved; the featured plan lands in `awaiting_payment`; a real PNG is accepted while a **non-image disguised as a PNG is rejected** (magic-byte check); >5 images 400; a repeated `Idempotency-Key` replays the first response instead of creating a second row |
| Approval state machine | approve publishes; approving a `featured` submission grants the promotion, a `free` one never does; a decided row cannot be decided twice (409); a rejected listing stays out of the catalogue; editor may read the queue but not decide (403) |
| Object-level authz | a user cannot see another user's submissions via `/api/listings` |
| Sorting | `traffic_desc` really orders by estimated views and `area_desc` by width × height (each guarded against a vacuous pass) |
| Anti-scraping | a scraper user agent is refused; `limit` is capped at 48 |
| Admin route | 401 without a session; 403 for a customer (signed in, wrong role); 200 for role `admin`; a write returns 403 for role `viewer` (RBAC) |
| Reviews | 404 on an unpublished listing; a successful review **recomputes** `billboards.rating` / `reviewCount`; a second review by the same account edits rather than adds |

Sessions for authenticated cases are opened the way a sign-in opens one — a
random token in the cookie, its SHA-256 as a `sessions` row (`mintSession` in
`test/helpers.mjs`) — so no login round trip is needed. Staff sessions name the
seeded staff rows, because the server reads that row on every request.

## Browser tests

```bash
npm run test:e2e    # reset prisma/e2e.db -> seed -> build into .next-e2e -> :3200 -> Chrome -> stop
```

11 flows, driven over the Chrome DevTools Protocol by `test/browser.mjs` (no
Playwright: its browser download is not reachable from the development
machine). They check that the server's answers become a usable page: the
filter narrows the catalogue, sign-in sticks across a reload, sign-up takes its
code, the contact number appears only after a sign-in, a listing with a photo
arrives as pending, the panel refuses a customer, and the catalogue works at
phone width. A failure leaves a screenshot in `test/screenshots/`. Set
`CHROME_PATH` when Chrome is not at its usual place. §31 of
`docs/engineering-decisions.md` records the races behind the first flaky
runs and how each was closed.

## Benchmark

```bash
npm run demo                # in one terminal — a production build; never measure `next dev` (§22)
npm run bench               # in another: 20 clients x 10s against /api/billboards?limit=24
BENCH_CONCURRENCY=50 BENCH_DURATION_MS=8000 npm run bench
npm run bench -- http://localhost:3000 /api/billboards?limit=48
BENCH_SINGLE_IP=1 npm run bench   # measure the per-IP rate limiter instead of throughput
```

By default `bench.mjs` rotates the `x-forwarded-for` IP to simulate many
distinct clients (otherwise the 60 req/min per-IP limit dominates the result).

Reference numbers on this machine, `next dev` (development mode, unoptimised),
dev.db (~2.8k rows):

| Scenario | Throughput | p50 | p95 |
|----------|-----------|-----|-----|
| `/api/billboards?limit=24`, 20 clients | ~108 req/s | 176 ms | 240 ms |
| same, 50 clients | ~107 req/s (saturated) | 461 ms | 527 ms |
| single client hammering | 60 requests then `429` | — | — |

Throughput is flat from 20 → 50 clients: the single Node process + synchronous
SQLite reads are the ceiling in dev mode. A production build (`next build &&
next start`) is materially faster. Under **write** load the first hard limit is
SQLite's single-writer lock, which the app hits on `POST /api/listings`.
