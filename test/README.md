# Test suite

Dependency-free API integration tests. No Jest/Vitest — just Node's built-in
`node:test` runner + `fetch` against a real `next dev` server backed by an
isolated SQLite database (`prisma/test.db`, git-ignored, never `dev.db`).

## Run

```bash
npm test          # reset test db -> seed fixtures -> start next dev :3100 -> run tests -> stop
```

71 tests. `npm test` is fully self-contained. It sets its own env (`AUTH_SECRET`,
`DATABASE_URL=file:./prisma/test.db`, dummy admin/Neshan vars) which override
any `.env*` file, so it never reads or writes the development database.

Helper scripts (rarely needed on their own):

```bash
npm run test:reset   # recreate prisma/test.db schema from prisma/schema.prisma
npm run test:seed    # load fixtures: 3 billboards, 2 users (password "secret123")
```

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
| Admin route | 401 without a session; 401 for role `user`; 200 for role `admin`; POST returns 403 for role `viewer` (RBAC) |
| Reviews | 404 on an unpublished listing; a successful review **recomputes** `billboards.rating` / `reviewCount`; a second review by the same account edits rather than adds |

Sessions for authenticated cases are minted directly with `jose` using the same
`AUTH_SECRET` the test server runs with (`test/helpers.mjs`), so no login round
trip is needed.

## Benchmark

```bash
npm run dev                 # in one terminal (uses the real dev.db + .env.local)
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
