# مرجع واسط برنامه‌نویسی

> `api.md` در انتهای همین فایل ادغام شده است.


---

# مرجع نقاط پایانی

## Rasamap — HTTP API reference

All routes are Next.js Route Handlers under `app/api/`. Inputs are validated with
Zod `.safeParse()`. User-facing error messages are in Persian. This document is
maintained by hand — update it when a route changes.

This file is also rendered in-app at **`/api-docs`** (self-hosted, no external
CDN). Demo accounts for trying the endpoints: [`RUNBOOK.md`](../RUNBOOK.md).

**Auth levels**

| Level | Meaning |
|-------|---------|
| public | no session needed |
| user | a signed-in **customer** session (`kind: "customer"` in the `rasamap_session` token). A staff session is refused with 403 |
| user / staff | any signed-in account |
| admin | a **staff** session with role `viewer` / `editor` / `admin` / `super_admin`, re-checked against its `admins` row on every request (enforced by `proxy.ts` **and** the route) |
| editor+ | role `editor`, `admin` or `super_admin` |
| admin+ | role `admin` or `super_admin` |

**Conventions**

- Session is a signed JWT (jose, HS256) in an HttpOnly `SameSite=Lax` cookie. Every
  request that carries one checks it against its account row (`sessionVersion`), so a
  password change or reset signs every other session out; one sign-in lasts at most
  seven days however often it is refreshed.
- Every route is declared with `defineRoute()` (`lib/http/route.ts`), which fixes the
  order **session → rate limit → role → Zod → business logic** — see the pattern at the end.
- Rate limits are named policies in `lib/rate-limit/`, fixed window with an optional
  lockout; the counters live in memory, or in Redis when `REDIS_URL` is set.
- A refusal from the data layer (`DomainError`) becomes 400/401/403/404/409 in one
  place; anything unexpected is a 500 with a quotable reference id.
- Auth failures use generic messages (no user enumeration).

**Idempotency-Key** (optional header on `POST /api/listings`)

- Value: 8–128 chars of `[A-Za-z0-9_-]`. Absent → the request runs normally.
- First time a key is seen (same user + endpoint): the request runs and the
  response is stored.
- Repeat of the same key: the stored response is replayed — no second row.
- A key reused by a different user or on a different endpoint → `409`.
- Only successful (2xx) responses are stored, so a failed attempt can be retried.
- Table: `idempotency_keys`.

---

### Public — billboards & catalogue

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/billboards` | public | List with filter + pagination. Query (Zod): `search` (≤100), `type` (allowlist), `availability` (`available\|busy\|reserved\|inactive`), `city` (≤60), `cities` (CSV, ≤50), `maxPrice` (0–100000), `sortBy` (`price_asc\|price_desc\|traffic_desc\|area_desc`), `page` (1–200), `limit` (1–**48**), `lat`/`lng` (a radial centre — both or neither, else 400) and `radiusKm` (1–50, default 5). Returns `{ items, total, page, pageSize, totalPages }`. With a centre, `total` is the size of the circle and paging is done in the app, because the circle is cut after the rows return. Rate limit is a per-address ceiling with no lockout → 429. `Cache-Control: max-age=60, stale-while-revalidate=300`. `search` is folded (Arabic ي/ك → ی/ک, half-space, digits) and every word must match. Unpublished rows (`pending`, `awaiting_payment`) are never returned, whatever `status` asks for. Owner phone is stripped. |
| GET | `/api/billboards/[slug]` | public | One billboard. `slug` must match `^[a-z0-9-]+$` → 400 otherwise. 404 if not found **or not yet published**. Same data layer as the detail page's Server Component. Cache as above. |
| POST | `/api/billboards/[slug]/contact` | user | The owner/agency phone number, plus **the lead it creates**. Kept out of every public response so it cannot be scraped (§20). POST rather than GET because the reveal is now an explicit click and an explicit click is a write: it get-or-creates a `contact_requests` row for (media, account) — a repeat reveal increments `count` instead of adding a row. 404 if the media is not published. A lead is written only for a `role: "user"` session (an admin's `userId` is not a `users` row). If the lead write fails the number is still returned and the failure is logged. `private, no-store`. |
| GET | `/api/stats` | public | Aggregate counts for the landing page. |
| GET | `/api/analytics` | public | Market analytics. Optional `?city=<name>`. |
| GET | `/api/health` | public | Liveness **and** readiness for whatever watches the process. Answers 200 `{ status: "ok" }` only after a `SELECT 1` reaches the database; 503 `{ status: "degraded" }` when it cannot, with the reason going to the log and not to the caller. The body is deliberately bare — no engine, version or uptime — because this is an unauthenticated URL. Exempt from the bot-user-agent filter in `proxy.ts`, since every monitor identifies itself as one, and the only route that writes no request log (`log: false` — it is polled forever and would bury the log). `no-store`. |

### User — reviews

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/reviews?billboardId=<id>` | public | Reviews for a billboard, latest 50, with the average. |
| POST | `/api/reviews` | user | Body (Zod): `billboardId`, `rating` (1–5), `comment` (10–1000). 404 if the media does not exist or is not published. One review per user per billboard (DB unique constraint) — a repeat submission edits the existing row. The write and the recomputation of `billboards.rating` / `reviewCount` from the reviews table happen in one `prisma.$transaction`. 201 on success. |

| POST | `/api/reviews/[id]/replies` | user / staff | Reply to a review, one level deep. Body (Zod): `body` (2–600). A customer's reply records `userId`, a staff reply records `staffId` — each a real foreign key into its own table — and `authorName` as it was when written. |
| DELETE | `/api/reviews/[id]/replies/[replyId]` | author / editor+ | Remove a reply. Its author may, and so may an editor or above — a public thread needs a way to be moderated. 404 (not 403) for a reply the caller may not touch. |
| DELETE | `/api/reviews/[id]` | user | A user removes their own review. 404 — not 403 — for a review that is not theirs, so the response cannot be used to discover which ids exist. The delete and the recomputation of `billboards.rating` / `reviewCount` happen in one `prisma.$transaction`. Editing needs no route: `POST /api/reviews` upserts on (billboardId, userId), so submitting again replaces what is there. |

### User — listings (the submission pipeline)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/listings` | user | An owner submits their media. Body (Zod): `name` (3–100), `phone`, `type`, `city`, `region?`, `location?`, `width`, `height`, `faces`, `price`, `plan` (`free\|featured`, default `free`), `images?` (≤5 base64 data URLs, ≤2 MB each). Starts as `pending`, or `awaiting_payment` for the featured plan. Images are validated by **magic bytes**, not by the declared MIME type, and written under an unguessable `/uploads/listings/<uuid>/` path. Request body capped (413). 201. Optional `Idempotency-Key` header (see below). |
| GET | `/api/listings` | user | The signed-in user's own submissions and their state (latest 50). Scoped by `session.userId` — a user cannot see another user's rows. Carries the full editable field set plus `reviewNote`, so a listing sent back for revision can be fixed in place on the dashboard without a second request. `no-store`. |
| PATCH | `/api/listings/[id]` | user | The submitter edits a listing an admin sent back and resubmits it. Same field set as the create. Only the owning account, and only while the row is still `needs_revision` (409 otherwise; 404 when the row is not the caller's — no enumeration). `images` may mix already-stored URLs (kept photos) with fresh `data:` URLs; a kept URL must be one of **this listing's own** current photos, never an arbitrary string. On success the row re-enters the queue at its plan's initial status, `featured` drops to false and `reviewNote` is cleared. Body capped (413). Writes `listing_resubmitted`. |

### User — auth

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/register` | public | Body (Zod): `name` (2–100), `phone` (`^09[0-9]{9}$`), `password` (6–128), `code` (6 digits, from `otp/send` with `purpose: "register"`). 409 if the phone exists; 400 if the code is wrong, spent or expired — the account is created only after it verifies. Sets the session cookie. Rate limit: 40 / hour / IP, plus the per-phone code ceiling. |
| POST | `/api/auth/login` | public | Body (Zod): `identifier` (a `09…` mobile number **or** a staff email — `phone` and `email` are still accepted as aliases) and `password`. The credential's own shape decides which table is consulted, so one form serves customers and staff without either answer revealing which store was read. Always runs a **real** bcrypt comparison — against `TIMING_PAD_HASH` when the phone is unknown — so response time cannot be used to enumerate accounts. 401 on bad credentials, identical body for "wrong password" and "unknown user". Rate limit: per account — 10 tries / 15 min for a phone, 5 for a staff email (the same budget as `/api/admin/auth/login`), a browser that signed in before counted on its own budget — plus a loose per-address ceiling → 429. |
| POST | `/api/auth/otp/send` | public | Start a phone-verified flow. Body (Zod): `phone`, `purpose` (`password_reset` \| `register`). A reset responds identically whether or not the number is registered, so it is no membership oracle; a sign-up answers 409 on a number that already has an account, because the register step must refuse it anyway. Rate limited per phone (3 / 10 min) and per IP (40 / hour). SMS is dormant unless `KAVENEGAR_API_KEY` is set. |
| POST | `/api/auth/otp/verify` | public | Password reset only (`purpose: "password_reset"`): verify the 6-digit code and set a new password in one step. A sign-up code lives under a different purpose and cannot be spent here. Codes are HMAC-hashed, 5-minute TTL, single-use, 5 attempts. Writes `password_reset_self`. |
| POST | `/api/auth/logout` | public | Revokes this session token (`revoked_sessions`) and clears the cookie. Other devices stay signed in. |
| GET | `/api/auth/me` | user / staff | The signed-in account `{ id, name, phone, email, role, isStaff }` (a customer's role reads `"user"`), plus a sliding refresh of the session cookie when under two hours remain. |
| PATCH | `/api/auth/me` | user | Update `name` and/or `password` for the current user. |

### Admin — auth

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/admin/auth/login` | public | Credentials are checked against the `admins` table, not against the environment: `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` are read only by `prisma/seed.ts`, which upserts the first `admins` row from them. An inactive account never signs in. bcrypt + JWT + audit entry. Rate limit: 5 tries / 15 min **per account** (plus a loose per-address ceiling with no lockout — see `lib/rate-limit/index.ts`). |
| POST | `/api/admin/auth/logout` | admin | Revokes this session token and clears the cookie. |
| GET | `/api/admin/auth/me` | admin | Current admin session. |
| PATCH | `/api/admin/auth/me` | viewer+ | Change one's own password. Body: `currentPassword`, `newPassword` (≥8). Spends the sign-in budget; ends every other session and re-issues this one. |

### Admin — billboards & listing approval

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/admin/billboards` | admin | List for the admin table. Query (Zod): `q`, `city`, `type`, `availability`, `moderation`, `page`, `limit` (≤100), `sort` (`<key>_<dir>`, keys `id\|price\|name\|city`, dirs `asc\|desc`). `no-store`. |
| POST | `/api/admin/billboards` | editor+ | Create. Body (Zod): `name`, `location`, `city`, `type` (allowlist), `price`, plus optional `agency`, `phone`, `description`, `width`, `height`, `faces`, `lat`, `lng`. 201. |
| GET | `/api/admin/billboards/[id]` | admin | Single record for the edit view. `no-store`. |
| PUT | `/api/admin/billboards/[id]` | editor+ | Partial update. Body (Zod): any of `name`, `location`, `city`, `type`, `availability`, `lat`, `lng`, `price`, `description`, `agency`, `phone`, `width`, `height`, `faces`. |
| DELETE | `/api/admin/billboards/[id]` | admin+ | Deletes. Refuses (409) if the billboard has reviews (they reference it with no cascade). |
| PUT | `/api/admin/billboards/[id]/images` | editor+ | Replace the image list. Mixes already-saved URLs (kept) with new base64 data URLs (validated by magic bytes, then written). Keeps the denormalised `hasImages` flag in step. |
| GET | `/api/admin/billboards/stats` | admin | Aggregate counts by type / availability / city for the admin dashboard. |
| GET | `/api/admin/listings` | editor+ | The approval queue: submissions not yet approved (`pending`, `awaiting_payment`, `needs_revision`, `rejected`), newest first, with the submitter. Query: `moderation`, `page`, `limit` (≤50). `no-store`. |
| POST | `/api/admin/listings/[id]/decision` | admin+ | Decide on a submission — the only place the listing state machine runs. Body (Zod): `decision` (`approve\|reject\|revision`), `note?` (≤1000, **required** for `reject` and `revision`), `seen` (the listing's `updatedAt` from the queue — the decision lands only on that version). `approve` publishes it (`moderation: approved`) and additionally grants `featured: true` when the submitted plan was `featured` (this is the manual payment confirmation); `reject` sets `rejected`; `revision` sets `needs_revision` and sends the note to the submitter's dashboard for an edit-and-resend. The note is stored on `reviewNote` and cleared on resubmit. 409 if the row was already decided, or changed since `seen`. Writes `listing_approved` / `listing_rejected` / `listing_revision_requested`. |
| GET | `/api/admin/customers` | admin+ | Registered end-user directory. Query: `q` (name/phone), `page`, `limit` (≤100), `sort` (`created_desc` \| `created_asc` \| `name_asc`). Returns `{ users: [{id,name,phone,createdAt,listingCount,reviewCount}], total, page, pages }`. `no-store`. Never returns the password hash. |
| GET | `/api/admin/customers/[id]` | admin+ | One user + their last 50 submitted listings + listing/review counts. `no-store`. Never returns the password hash. |
| PATCH | `/api/admin/customers/[id]` | admin+ | Edit `name` and/or `phone` (phone must be a valid `09xxxxxxxxx` and unique → 409). Writes `customer_update`. |
| GET | `/api/admin/leads` | editor+ | The demand side: contact requests, newest activity first, with the requesting user and the media. Query (Zod): `status` (`new\|contacted\|closed`), `page`, `limit` (≤50). Returns `{ leads, counts, total, page, pages }` where `counts` carries every status (0 included). `no-store`. |
| PATCH | `/api/admin/leads/[id]` | editor+ | Move the follow-up state and keep an internal memo. Body (Zod): `status?` (allowlist), `note?` (≤500, `""` clears it) — at least one required. Only these two fields are writable: who asked for which number and when is a record of an event, not editable data. The note is never shown to the user. 404 for an unknown lead. Writes `lead_update`. |
| POST | `/api/admin/customers/[id]/reset-password` | admin+ | Set a new password. Optional body `{ password }` (≥8); omitted → a readable random one is generated and returned **once** as `{ password }`. An existing password can never be read back (bcrypt). Writes `customer_password_reset`. |
| GET | `/api/admin/users` | super_admin | List admin accounts (`{ admins, currentId }`). `no-store`. |
| POST | `/api/admin/users` | super_admin | Create an admin. Body (Zod): `email`, `name`, `role` (`viewer\|editor\|admin\|super_admin`), `password` (≥8). 409 on a duplicate email. Writes `admin_user_create`. |
| PATCH | `/api/admin/users/[id]` | super_admin | Change `role` and/or `active`. 409 if the id is your own account. Writes `admin_user_update`. |
| GET | `/api/admin/audit` | admin+ | Returns `{ logs, persisted }` — `logs` is the in-memory ring buffer (last 500), `persisted` is the durable `audit_logs` table (last 200, survives restart). Persisted actions: `billboard_create` / `billboard_update` / `billboard_delete` / `listing_approved` / `listing_rejected` / `password_reset_self` / `admin_user_create` / `admin_user_update` / `customer_update` / `customer_password_reset` / `admin_password_change` / `billboard_images_update` / `rate_limit_hit` (one per lockout), each with actor email + IP + a `details` object. |

---

### Anti-scraping

Enforced in `proxy.ts` before any handler runs:

- Automation user agents (`python-requests`, `curl`, `scrapy`, headless
  browsers, HTTP client libraries…) are refused on `/api/*` and on the
  catalogue pages. Search-engine crawlers are explicitly exempt so the site
  stays indexable.
- A per-IP budget of 90 requests/minute on `/explore` and `/billboard/*`, so the
  HTML pages are not a cheaper door than the API.
- Hotlink protection on `/images/scraped/*` and `/uploads/*`: a cross-origin
  `Referer` is refused (a missing one is allowed — real browsers omit it).
- `limit` is capped at 48 per page and the bulk map endpoint was removed.
- The owner's phone number is never in a public response.

None of this makes scraping impossible — a headless browser with a normal user
agent and a slow crawl still works. It raises the cost and removes the cheap
bulk endpoints.

### Testing

`test/api.test.mjs` (`npm test`) exercises the public billboards routes
(including that the sort options really order by views and by area, and that
unpublished rows stay hidden), register/login (validation, rate limit, no
enumeration by body **or by timing**), the OTP reset flow, the listing pipeline
(upload magic-byte validation, plan → status, Idempotency-Key replay),
object-level authorisation on `/api/listings`, admin RBAC, the approval state
machine, reviews and the denormalised rating aggregate, analytics coverage
counts, and the durable audit log. **179 tests** (12 unit tests of the pure rules,
160 API, 7 covering the nightly importer), plus 10 browser flows in
`npm run test:e2e`.

---

# الگوی نوشتن یک مسیر تازه

## API Route Patterns

Read this file when writing or modifying API routes.

---

### Every route: `defineRoute`

A route states what it needs; `lib/http/route.ts` decides when. The order —
**access → rate limit → role → params / query / body → handler** — is written
once there, so no route can reorder it, and the compiler refuses a route that
names no rate limit.

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { updateLead } from "@/lib/db/leads";

// PATCH /api/admin/leads/[id] — editor+
export const PATCH = defineRoute(
  {
    name: "admin/leads/[id]",          // logs and audit rows
    access: { staff: "editor" },       // "public" | "signed-in" | "customer" | { staff: role }
    rateLimit: adminApiRateLimit,      // a named policy; "none" only for signing out
    params: idParams,                  // 400 "شناسه نامعتبر" when it fails
    body: z.object({ status: z.enum(["new", "contacted", "closed"]).optional(), note: z.string().max(500).optional() }),
  },
  async ({ actor, params, body, audit }) => {
    const { before, lead } = await updateLead(params.id, body);   // throws DomainError → 404/409
    await audit("lead_update", { details: { leadId: params.id, from: before.status, to: lead.status } });
    return NextResponse.json({ lead });                          // no-store is added for non-public routes
  },
);
```

What the handler receives is already typed by what the route declared:
`actor` is a `StaffActor` for `{ staff: … }`, a `CustomerActor` for
`"customer"`, either for `"signed-in"`, and `null` for `"public"`; `params`,
`query` and `body` are the Zod outputs.

Rules the pipeline cannot enforce, and the reviewer should:

- **No Prisma in a route.** Business logic and every query live in `lib/db/*`
  (ESLint refuses `@/lib/db/client` anywhere else). A rule that holds with no
  I/O at all — a state transition, a derived price — goes in `lib/domain/*`.
- **Refuse with a `DomainError`** (`notFound`, `conflict`, `invalid`,
  `forbidden` from `lib/domain/errors.ts`), with a Persian message. The route
  does not choose the status code.
- **A second, input-keyed limit** (per phone number, per account) is checked in
  the handler with `ctx.tooMany(rl)`, or declared as
  `rateLimit: { afterBody: (body, ip) => … }` when it *is* the route's limit —
  the sign-in forms, whose tight budget follows the account in the body.
- **Audit** with `ctx.audit(action, …)`: the actor goes in as a real foreign key.

### RBAC Roles

Staff: `super_admin > admin > editor > viewer` (`lib/domain/roles.ts`). A
customer is a different kind of account, not the bottom rung — a route admits
one or the other through `access`.

Check inside logic: `hasRole(actor.role, "admin")`.

- DELETE billboard: requires `admin`
- PUT/update billboard: requires `editor`
- GET admin routes: requires `viewer`

---

### Admin Billboard CRUD

| Method | Route | Role | Notes |
|---|---|---|---|
| GET | `/api/admin/billboards` | viewer+ | list with filters |
| POST | `/api/admin/billboards` | editor+ | create |
| PUT | `/api/admin/billboards/[id]` | editor+ | update |
| DELETE | `/api/admin/billboards/[id]` | admin+ | fails with 409 if the row has reviews |
| GET | `/api/admin/billboards/stats` | viewer+ | aggregate stats |

### Auth Endpoints (always public, bypass proxy)

| Method | Route | Notes |
|---|---|---|
| POST | `/api/auth/register` | phone regex `^09[0-9]{9}$`, verified by a one-time code, bcrypt cost 12 |
| POST | `/api/auth/login` | rate-limited, timing-safe dummy hash |
| GET | `/api/auth/me` | returns session user or 401 |
| POST | `/api/auth/logout` | revokes token, clears cookie |
| POST | `/api/admin/auth/login` | rate-limited, audit logged |
| POST | `/api/admin/auth/logout` | revokes token, clears cookie |
| GET | `/api/admin/auth/me` | returns admin session |
| PATCH | `/api/admin/auth/me` | own password change |

### Listing Endpoints (customer session required)

| Method | Route | Notes |
|---|---|---|
| POST | `/api/listings` | user session required; image upload validated by magic bytes; `Idempotency-Key` supported |
| GET | `/api/listings` | user session required — the caller's own submissions only |
| GET | `/api/admin/listings` | editor+ — the approval queue |
| POST | `/api/admin/listings/[id]/decision` | admin+ — approve/reject; single-shot (409 on a second decision) |
