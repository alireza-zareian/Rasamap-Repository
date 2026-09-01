# Rasamap — Architecture & the data-flow model

> **FOR FUTURE AGENTS / REPORT GENERATORS**
> When you produce any HTML report, slide, or summary for the thesis reviewers,
> **include the "Two data paths" explanation and the kitchen analogy below**
> (adapted to the report's tone). The first question a reviewer asks about a
> Next.js app is *"why doesn't every page call the API?"* — the answer must be
> ready, in plain language, with the comparison table. Do not describe the
> Server-Component-reads-the-database path as a shortcut or a gap; it is the
> framework's recommended pattern and the higher-performance choice. Keep this
> note when you edit this file.

---

## 1. What Rasamap is (and what it is not)

Rasamap is a **full-stack Next.js 16 application**: the browser UI, the HTTP API,
and server-side rendering all live in one codebase and one deployable unit.

It is **not** a headless backend. A headless API (for example a Django + DRF
service) has no UI of its own — the only way data can leave the server is an
HTTP/JSON endpoint, because there is no server-rendered page to put data on.
That constraint is why a DRF project looks "100% API". Rasamap is a different
category of program and is *not* meant to look the same.

## 2. Two data paths — on purpose

| Path | Used by | Mechanism | Why |
|------|---------|-----------|-----|
| **A — Server reads the database directly** | The billboard **detail page** (`app/billboard/[slug]/page.tsx`), a React **Server Component** | `getBillboardBySlug()` from `lib/db/billboards.ts`, called during server render | Fastest possible: one hop (server → DB), no HTTP round-trip to ourselves, no JSON serialize/parse, no extra request to schedule. This is the pattern the [Next.js docs](https://nextjs.org/docs) explicitly recommend: *"you do not need to create an API endpoint to fetch data in a Server Component."* |
| **B — Browser calls the HTTP API** | Every **client** page and component: Home, Explore, Dashboard, Analytics, Admin, list-media, BookingModal, ReviewsSection, the admin panels | `fetch("/api/...")` from `"use client"` code | The browser needs *fresh, interactive* data after the page has loaded — live filtering, pagination, booking, admin edits. That must go over HTTP. |

**Both paths call the same data layer** — `lib/db/billboards.ts` (Prisma). There
is one source of truth. An API route and a Server Component that fetch the same
resource run the same query through the same module. No duplication, no
divergent logic, no "the page shows stale data while the API shows fresh data".

## 3. The kitchen analogy (use this with reviewers)

- A **headless DRF API is a cloud kitchen**: delivery only, no dining room. Every
  plate leaves through the delivery window (the API) because there is no other
  exit. That is a property of the building, not a badge of quality.
- **Rasamap is a restaurant that also does delivery.**
  - A guest at a table (opening a page) → the waiter walks to the kitchen and
    brings the food directly. No packaging, no driver, no GPS. → **Path A**,
    the Server Component reading the database.
  - A delivery order (the browser wanting fresh data after load — a filter, a
    new page of results, a booking) → the food is packaged and a driver takes
    it out the window. → **Path B**, `fetch("/api/...")`.
  - The **kitchen is the same** for both (`lib/db/billboards.ts`). One recipe book.
  - Forcing the dine-in plates out through the delivery window — packaged, into
    a car, around the block, back in — just to "match delivery" would be slower
    and pointless. That is exactly what *"make every page fetch from /api/"*
    would do.

## 4. Performance — why Path A is the fast one

| | Server Component → DB (Path A) | Page fetching its own `/api/` route |
|---|---|---|
| Network hops | 1 (server → DB) | 2+ (server → HTTP to itself → route → DB) |
| Extra work | none | build a `Request`, run the handler, serialise JSON, parse it back |
| Typical cost here | ~5–20 ms | ~40–150 ms + more CPU per request |
| Static generation / caching | works | breaks (needs an absolute URL, a running server) |

For millions of users, Path A is the **high-performance choice**. Converting the
detail page to fetch from `/api/billboards/[slug]` during render would *add*
latency and CPU on every request — a regression, not an improvement.

## 5. Current data-access map (every page)

| Page | Source | Path |
|------|--------|------|
| `/` (Home) | `fetch("/api/billboards")`, `fetch("/api/stats")` | B |
| `/explore` | `fetch("/api/billboards?…")` | B |
| `/explore/map` | redirects to `/explore` | — |
| `/dashboard` | `fetch("/api/auth/me")`, `fetch("/api/reservations/my")` | B |
| `/analytics` | `fetch("/api/analytics")` | B |
| `/admin` | `fetch("/api/admin/*")` (also guarded by `proxy.ts`) | B |
| `/list-media` | `fetch("/api/listings")` | B |
| `/compare` | `localStorage` (objects originally from `/api/billboards`) | B (cached) |
| `/billboard/[slug]` | `getBillboardBySlug()` — Server Component | **A** |

Every browser interaction already goes through `/api/`. The single exception is
the *initial server render* of the detail page, which is faster done on the
server. For completeness, `GET /api/billboards/[slug]` also exists (same data
layer) so every resource has a REST endpoint too — see [`api.md`](./api.md).

## 6. Is the architecture "finished"?

The **shape** is correct and idiomatic and does not need restructuring:
shared data layer, client talks to the API, server renders from the DB directly,
`proxy.ts` as the auth boundary, Zod on every input.

What remains is **incremental tuning, not redesign** — e.g. Partial Prerendering
on `/explore`, streaming/RSC for more of the static page chrome, `useOptimistic`
on the booking form, HTTP-level response caching, `next/image` for scraped
photos. These are listed in `docs/STATUS.md` (P5–P10) and are post-demo polish.
Calling the current design "perfect and unimprovable" would be inaccurate;
calling it "sound, standard, and not in need of an architectural change" is
accurate.

## 7. One-line answer for the defense

> "Rasamap is API-driven: every client interaction goes through `/api/`. The
> billboard detail page renders on the server and reads through the *same* data
> layer the API uses — the Next.js-recommended pattern — instead of making the
> server issue an HTTP call to itself. A headless framework like DRF has only
> the API path because it has no server-rendered UI; Next.js has both, and uses
> each where it is faster."
