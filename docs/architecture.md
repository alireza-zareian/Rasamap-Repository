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
| **A — the server reads the database directly** | The billboard detail page (`app/billboard/[slug]/page.tsx`), a React Server Component | `getBillboardBySlug()` from `lib/db/billboards.ts`, during server render | One hop (server → DB): no HTTP round-trip to ourselves, no JSON serialize/parse, no extra request. This is the pattern the Next.js documentation recommends — a Server Component does not need an API endpoint to read data. |
| **B — the browser calls the HTTP API** | Every client page and component: Home, Explore, Dashboard, Analytics, Admin, list-media, BookingModal, ReviewsSection, the admin panels | `fetch("/api/...")` from `"use client"` code | After the page has loaded, the browser needs fresh, interactive data — live filtering, pagination, booking, admin edits — which has to travel over HTTP. |

Both paths call the **same data layer**, `lib/db/billboards.ts` (Prisma). A
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
  next page, a booking) → the food is packed and a driver takes it out. This is
  **Path B**.
- The kitchen (`lib/db/billboards.ts`) is the same for both.

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
| `/` (Home) | `fetch("/api/billboards")`, `fetch("/api/stats")` | B |
| `/explore` | `fetch("/api/billboards?…")` | B |
| `/explore/map` | redirects to `/explore` | — |
| `/dashboard` | `fetch("/api/auth/me")`, `fetch("/api/listings")` | B |
| `/analytics` | `fetch("/api/analytics")` | B |
| `/admin` | `fetch("/api/admin/*")` (also guarded by `proxy.ts`) | B |
| `/list-media` | `fetch("/api/listings")` | B |
| `/compare` | `localStorage` (objects originally from `/api/billboards`) | B (cached) |
| `/billboard/[slug]` | `getBillboardBySlug()` — Server Component | **A** |

Every browser interaction goes through `/api/`. The only exception is the initial
server render of the detail page, which is faster done on the server.
`GET /api/billboards/[slug]` also exists (same data layer), so every resource has
a REST endpoint as well — see [`api.md`](./api.md).

## 6. Is the architecture finished?

The shape is sound and standard and needs no restructuring: a shared data layer,
the client talking to the API, the server rendering from the database directly,
`proxy.ts` as the auth boundary, Zod on every input.

What remains is incremental tuning, not redesign:

- Partial Prerendering on `/explore`
- streaming / more of the static page chrome as Server Components
- `useOptimistic` on the booking form
- HTTP-level response caching on the remaining GET routes
- `next/image` for scraped photos

These are tracked in `docs/STATUS.md` (P5–P10). The current design is not
"perfect and unimprovable"; it is correct, and improvement from here is tuning
rather than architectural change.

## 7. Summary

Rasamap is API-driven: every client interaction goes through `/api/`. The
billboard detail page renders on the server and reads through the same data layer
the API uses — the Next.js-recommended pattern — rather than having the server
make an HTTP call to itself. A headless framework has only the API path because
it has no server-rendered UI; Next.js has both and uses each where it is faster.
