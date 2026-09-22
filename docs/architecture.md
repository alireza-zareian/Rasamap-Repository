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
| **A — the server reads the database directly** | The billboard detail page (`app/billboard/[slug]/page.tsx`), a React Server Component | `getBillboardBySlug()` from `lib/db/billboards/`, during server render | One hop (server → DB): no HTTP round-trip to ourselves, no JSON serialize/parse, no extra request. This is the pattern the Next.js documentation recommends — a Server Component does not need an API endpoint to read data. |
| **B — the browser calls the HTTP API** | The signed-in and interactive surfaces: Dashboard, Admin, Analytics, list-media, Compare, `ReviewsSection`, `BillboardContact` | `fetch("/api/...")` from `"use client"` code | These screens are sessions, not documents: the user submits a listing, approves one, posts a review, reveals a phone number. That data has to travel over HTTP after the page has loaded. |

Both paths call the **same data layer**, `lib/db/billboards/` (Prisma). A
route handler and a Server Component that read the same resource run the same
query through the same module: one source of truth, no duplicated logic, no
"the page is stale but the API is fresh".

## 3. An analogy

A headless DRF API is a cloud kitchen: delivery only, no dining room. Every plate
leaves through the delivery window because there is no other exit — a property of
the building, not a mark of quality.

Rasamap is a restaurant that also delivers:

- A guest at a table (a page being rendered) → the waiter brings the food
  straight from the kitchen. No packaging, no driver. This is **Path A**.
- A delivery order (the browser asking for fresh data after load — a filter, the
  next page, a submitted listing, an admin decision) → the food is packed and a
  driver takes it out. This is **Path B**.
- The kitchen (`lib/db/billboards/`) is the same for both.

Sending the dine-in plates out the delivery window and back in, just for
uniformity, would be slower and pointless — which is what routing every page
through `fetch("/api/...")` during render would amount to.

## 4. Performance

| | Server Component → DB (Path A) | Page fetching its own `/api/` route |
|---|---|---|
| Network hops | 1 (server → DB) | 2+ (server → HTTP to itself → route → DB) |
| Extra work | none | build a `Request`, run the handler, serialise JSON, parse it back |
| Typical cost here | ~5–20 ms | ~40–150 ms + more CPU per request |
| Static generation / caching | works | breaks (needs an absolute URL and a running server) |

At scale, Path A is the faster choice. Converting the detail page to fetch from
`/api/billboards/[slug]` during render would add latency and CPU to every
request.

## 5. Current data-access map

| Page | Source | Path |
|------|--------|------|
| `/` (Home) | `getCachedShowcaseBillboards()`, `getCachedSiteStats()` — Server Component | **A** |
| `/explore` | `getCachedFilteredBillboards()` — Server Component; the query string is the state | **A** |
| `/explore/map` | `getCachedMapPins()`, `getCachedFilteredBillboards()`, `getCachedSiteStats()` — Server Component | **A** |
| `/billboard/[slug]` | `getCachedBillboardBySlug()`, `getCachedRelatedBillboards()` — Server Component | **A** |
| `/dashboard` | `fetch("/api/auth/me")`, `fetch("/api/listings")` | B |
| `/admin` | `fetch("/api/admin/*")` (also guarded by `proxy.ts`) | B |
| `/analytics` | `fetch("/api/analytics")` | B |
| `/list-media` | `fetch("/api/listings")` | B |
| `/compare` | `localStorage` (objects originally from `/api/billboards`) | B (cached) |

The four read-heavy pages a visitor lands on render on the server; the pages
behind a sign-in, where the screen is a long-lived interactive session rather
than a document, stay on the API. The `getCached*` wrappers live in
`lib/db/cached.ts` and sit in front of the same `lib/db/billboards/` functions a
route handler calls — caching is a layer over the data layer, not a second copy
of it.

Every resource a page reads this way also has a REST endpoint (`GET
/api/billboards/[slug]` and the rest), backed by the same module — see
[`api.md`](./api.md). So Path A is not a private back door: it is the same query,
reached without an HTTP hop the server would be making to itself.

## 6. Is the architecture finished?

The shape is sound and standard and needs no restructuring: a shared data layer,
the client talking to the API, the server rendering from the database directly,
`proxy.ts` as the auth boundary, Zod on every input.

What remains is incremental tuning, not redesign:

- Partial Prerendering on `/explore`
- streaming more of the static page chrome
- HTTP-level response caching on the remaining GET routes

These are tracked in `docs/STATUS.md`. The current design is not "perfect and
unimprovable"; it is correct, and improvement from here is tuning rather than
architectural change.

Two properties of the dependency graph are measured rather than asserted, from
the same `import` data `docs/thesis/build.py` extracts: across 165 TypeScript
files and 489 edges there are **zero** edges pointing from a lower layer up into
a higher one, and **zero** cycles. Dependencies run one way — `app → components →
lib → prisma` — which is what makes any one layer readable, testable and
replaceable on its own. See §34 of [`engineering-decisions.md`](./engineering-decisions.md).

## 7. Summary

Rasamap uses both of the data paths its framework offers, and each where it is
faster. The four pages a visitor lands on — home, catalogue, map, media detail —
render on the server and read through the data layer directly, which is the
pattern the Next.js documentation recommends and avoids having the server make an
HTTP call to itself. Everything interactive behind a sign-in talks to `/api/`,
and every resource has a REST endpoint regardless, backed by the same module. A
headless framework has only the API path because it has no server-rendered UI;
Next.js has both.

The data layer those paths share is `lib/db/billboards/`, split by direction —
`queries.ts` reads, `mutations.ts` writes, `core.ts` holds what both need — so
the rule that a write drops the catalogue cache tag is visible in the file names
rather than left to prose.
