# Rasamap — Architecture & the data-flow model

## 1. What Rasamap is

Rasamap is a **full-stack Next.js 16 application**: the browser UI, the HTTP API,
and server-side rendering live in one codebase and deploy as one unit.

It is not a headless backend. A headless API — a Django + DRF service, say — has
no UI of its own, so the only way data leaves the server is an HTTP/JSON
endpoint. That is why such a project is "100% API": it has no other option.
Next.js is a different category and does not have that constraint.

## 2. Two data paths

| Path | Used by | Mechanism | Rationale |
|------|---------|-----------|-----------|
| **A — the server reads the data layer directly** | Every page's first screen: home, catalogue, map, media detail, analytics, the customer dashboard and every admin panel section | A Server Component calls a function from `lib/db/` while it renders | One hop (server → DB): no HTTP round-trip to ourselves, no JSON serialise/parse, no extra request. This is the pattern the Next.js documentation recommends — a Server Component does not need an API endpoint to read data. |
| **B — the browser calls the HTTP API** | What a user *does* after the page has loaded: post a review, reveal a phone number, submit or resubmit a listing, approve one, page through an admin table, pick a city on /analytics | `fetchJson("/api/…")` from `"use client"` code | These are actions and user-driven refreshes, not documents. They have to travel over HTTP because they happen after the page exists. |

The rule is short: **the first screen is rendered with its data on the server;
the browser asks the API only in response to what the user does.**

Both paths call the **same data layer**, `lib/db/`. A route handler and a Server
Component that read the same resource run the same function: one source of
truth, no duplicated logic, no "the page is stale but the API is fresh".

## 3. An analogy

A headless DRF API is a cloud kitchen: delivery only, no dining room. Every plate
leaves through the delivery window because there is no other exit — a property of
the building, not a mark of quality.

Rasamap is a restaurant that also delivers:

- A guest at a table (a page being rendered) → the waiter brings the food
  straight from the kitchen. No packaging, no driver. This is **Path A**.
- A delivery order (the browser asking for something after the page has loaded —
  a submitted review, an admin decision, the next page of a table) → the food
  is packed and a driver takes it out. This is **Path B**.
- **The kitchen** (`lib/db/`) is the same for both, and it is the only room with
  access to the pantry: nothing outside it may open the database (ESLint
  refuses the import).
- **The recipes** (`lib/domain/`) are written down apart from the kitchen —
  what an approval does to a listing, how a yearly price follows from a
  monthly one — so they can be checked without lighting a stove (unit tests,
  no database).
- **The front door** (`lib/http/route.ts`) is where every delivery order is
  checked, in the same order every time: who is ordering, whether they are
  ordering too fast, whether they are allowed this dish, whether the order
  makes sense — and only then is it passed to the kitchen.

Sending the dine-in plates out the delivery window and back in, just for
uniformity, would be slower and pointless — which is what routing every page
through `fetch("/api/...")` during render would amount to.

## 4. The layers

```
app/**/page.tsx          pages — Server Components render the first screen (Path A)
app/api/**/route.ts      routes — each declares its contract with defineRoute() (Path B)
components/              UI; "use client" only where there is interaction
        │
        ▼
lib/http/                the request pipeline: access → rate limit → role → Zod → handler
lib/auth/                session token, typed Actor (customer | staff), passwords
lib/rate-limit/          named limits; counters in memory, or Redis when REDIS_URL is set
        │
        ▼
lib/db/                  the data access layer — server-only, the only code that imports Prisma
lib/domain/              the product's rules, with no I/O at all
        │
        ▼
prisma/schema.prisma     the tables, enums and foreign keys
```

This is the shape the Next.js data-security guide recommends for a new project
(`node_modules/next/dist/docs/01-app/02-guides/data-security.md`): a
**Data Access Layer** that only runs on the server (`import "server-only"`),
performs authorisation checks, and returns minimal DTOs. Three parts of it are
enforced by the toolchain rather than by prose:

| Rule | Enforced by |
|---|---|
| Only `lib/db/` imports the database client; nothing imports `lib/data.ts` except the seed; nothing reaches past `lib/db/billboards/index.ts` | `no-restricted-imports` in `eslint.config.mjs` |
| `lib/domain/` imports nothing with I/O | the same rule, scoped to that folder |
| Every API route goes through `defineRoute()` and names a rate limit | the route's types, and a guard test in `test/api.test.mjs` |
| A customer id is never written where a staff id belongs, or the reverse | `Actor` is a discriminated union (`kind: "customer" \| "staff"`), and the session token carries `kind` |

## 5. Current data-access map

| Page | First screen (Path A) | After load (Path B) |
|------|--------|------|
| `/` (Home) | `getCachedShowcaseBillboards()`, `getCachedSiteStats()` | — |
| `/explore` | `getCachedFilteredBillboards()` — the query string is the state | — (a filter is a new address) |
| `/explore/map` | `getCachedMapPins()`, `getCachedFilteredBillboards()` | — |
| `/billboard/[slug]` | `getCachedBillboardBySlug()`, `getCachedRelatedBillboards()` | reviews, replies, the phone reveal |
| `/analytics` | `getCachedCatalogueAnalytics()` | a city's figures |
| `/dashboard` | `getActor()`, `listOwnListings()` | profile edits, resubmitting a listing |
| `/admin/*` | `requireStaff()` in the layout; `getAdminStats()` on the overview and scraper sections | tables, decisions, edits |
| `/list-media` | — (a form) | the submission |
| `/compare` | — (`localStorage`) | — |

The `getCached*` wrappers live in `lib/db/cached.ts` and sit in front of the
same `lib/db/` functions a route handler calls — caching is a layer over the data
layer, not a second copy of it. Every resource a page reads this way also has a
REST endpoint, backed by the same module — see [`api.md`](./api.md). So Path A
is not a private back door: it is the same query, reached without an HTTP hop
the server would be making to itself.

## 6. Measured, not asserted

From the `import` data `docs/thesis/build.py` extracts (195 TypeScript files,
497 edges):

- **Zero cycles.** No file depends, directly or through others, on itself.
- **Zero upward edges.** Dependencies run one way — pages and routes →
  components → `lib` — so any layer can be read, tested or replaced on its own.
- **13 files import the database client, all of them inside `lib/db/`.** Before
  the data layer was made the only door (§35), 30 did, including the route
  handlers themselves.
- **One route pipeline.** All 35 route files declare themselves through
  `defineRoute()`; the order of the security checks is written once.

What remains is tuning, not redesign — Partial Prerendering on `/explore`,
streaming more of the static chrome — tracked in `docs/STATUS.md`.

## 7. Summary

Rasamap uses both of the data paths its framework offers, and each where it is
faster. Every page renders its first screen on the server by calling the data
layer directly — the pattern the Next.js documentation recommends, which avoids
the server making an HTTP call to itself. What a user does after that goes to
`/api/`, through one pipeline that checks the session, the rate, the role and
the input in a fixed order before the data layer is reached. A headless
framework has only the API path because it has no server-rendered UI; Next.js
has both.

The data layer both paths share is `lib/db/` — server-only, the one place that
talks to the database, and the place authorisation on a resource lives. The
rules of the product sit beside it in `lib/domain/`, with no I/O, which is what
lets them be unit-tested in under a second.
