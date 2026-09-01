# Rasamap — HTTP API reference

All routes are Next.js Route Handlers under `app/api/`. Inputs are validated with
Zod `.safeParse()`. User-facing error messages are in Persian. This document is
maintained by hand — update it when a route changes.

**Auth levels**

| Level | Meaning |
|-------|---------|
| public | no session needed |
| user | valid `role: "user"` session cookie (`rasamap_session`) |
| admin | session with role `viewer` / `editor` / `admin` / `super_admin` (enforced by `proxy.ts` **and** the route) |
| editor+ | role `editor`, `admin` or `super_admin` |
| admin+ | role `admin` or `super_admin` |

**Conventions**

- Session is a signed JWT (jose, HS256) in an HttpOnly `SameSite=Strict` cookie.
- Admin route order is fixed: **session check → rate limit → Zod → business logic**.
- Rate limits are per-IP, in-memory sliding window (`lib/auth/rate-limit.ts`).
- Auth failures use generic messages (no user enumeration).

---

## Public — billboards & catalogue

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/billboards` | public | List with filter + pagination. Query (Zod): `search` (≤100), `type` (allowlist), `status` (allowlist), `city` (≤60), `cities` (CSV, ≤50), `maxPrice` (0–100000), `sortBy` (`price_asc\|price_desc\|traffic_desc\|area_desc`), `page` (1–1000), `limit` (1–100). Returns `{ items, total, page, pageSize, totalPages }`. Rate limit 60/min → 429. `Cache-Control: max-age=60, stale-while-revalidate=300`. Known bot UAs get an empty result set. |
| GET | `/api/billboards/[slug]` | public | One billboard. `slug` must match `^[a-z0-9-]+$` → 400 otherwise. 404 if not found. Same data layer as the detail page's Server Component. Cache as above. |
| GET | `/api/billboards/pins` | public | Slim payload for the map (id, name, coords, price, type). |
| GET | `/api/stats` | public | Aggregate counts for the landing page. |
| GET | `/api/analytics` | public | Market analytics. Optional `?city=<name>`. |

## Public / user — reservations & reviews

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/reservations?billboardId=<id>` | public | Booked, non-cancelled date ranges for a billboard (for the date picker). `no-store`. |
| POST | `/api/reservations` | user | Body (Zod): `billboardId` (int>0), `startDate`, `endDate` (ISO datetime or `YYYY-MM-DD`), `note?` (≤500). Rejects end ≤ start (400), past start (400), inactive billboard (409), **overlapping range (409)** — the overlap check + insert run in one `prisma.$transaction`. 201 on success. Rate limit 60/min. |
| GET | `/api/reservations/my` | user | Current user's reservations (latest 50), each joined with its billboard. Scoped by `session.userId` — a user cannot see another user's rows. `no-store`. |
| GET | `/api/reviews?billboardId=<id>` | public | Reviews for a billboard. |
| POST | `/api/reviews` | user | Body (Zod): `billboardId`, `rating` (1–5), `comment`. **403 unless the user has a `confirmed` reservation for that billboard.** One review per user per billboard (DB unique constraint). 201 on success. |

## User — listings & auth

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/listings` | user | Owner submits a billboard for review — created with `status: "pending"`. |
| POST | `/api/auth/register` | public | Body (Zod): `name` (2–100), `phone` (`^09[0-9]{9}$`), `password` (6–128). 409 if the phone exists. Sets the session cookie. Rate limit: 5 / hour / IP. |
| POST | `/api/auth/login` | public | Body (Zod): `phone`, `password`. Always runs bcrypt (dummy hash when the user is missing) — timing-safe, no user enumeration. 401 on bad credentials, identical body for "wrong password" and "unknown user". Rate limit: 10 / 15 min / IP → 429 + lockout. |
| POST | `/api/auth/logout` | public | Clears the session cookie. |
| GET | `/api/auth/me` | user | Current session `{ userId, name, phone, role }`. |
| PATCH | `/api/auth/me` | user | Update `name` and/or `password` for the current user. |

## Admin — auth

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/admin/auth/login` | public | Admin credentials from env (`ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH`). bcrypt + JWT + audit entry. Rate limit: 5 / 15 min. |
| POST | `/api/admin/auth/logout` | admin | Clears the admin session. |
| GET | `/api/admin/auth/me` | admin | Current admin session. |

## Admin — billboards & reservations

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/admin/billboards` | admin | List for the admin table. Query (Zod): `q`, `city`, `type`, `status`, `page`, `limit` (≤100), `sort` (`<key>_<dir>`, keys `id\|price\|name\|city`, dirs `asc\|desc`). `no-store`. |
| POST | `/api/admin/billboards` | editor+ | Create. Body (Zod): `name`, `location`, `city`, `type` (allowlist), `price`, plus optional `agency`, `phone`, `description`, `width`, `height`, `faces`, `lat`, `lng`. 201. |
| PUT | `/api/admin/billboards/[id]` | editor+ | Partial update. Body (Zod): any of `name`, `location`, `city`, `type`, `status`, `lat`, `lng`, `price`, `description`, `agency`, `phone`, `width`, `height`, `faces`. |
| DELETE | `/api/admin/billboards/[id]` | admin+ | Deletes. Refuses (409) if the billboard has active reservations. |
| PUT | `/api/admin/billboards/[id]/images` | editor+ | Replace the image list for a billboard. |
| GET | `/api/admin/billboards/stats` | admin | Aggregate counts by type / status / city for the admin dashboard. |
| GET | `/api/admin/reservations` | admin | All reservations for the management panel. |
| PATCH | `/api/admin/reservations/[id]` | admin | Update a reservation `status` (`confirmed` / `cancelled`). |
| GET | `/api/admin/audit` | admin+ | In-memory audit log (last 500 entries). |

---

## Testing

`test/api.test.mjs` (`npm test`) exercises the public billboards routes,
register/login (validation, rate limit, no enumeration), reservations
(validation + overlap + concurrent-double-submit race guard), object-level
authorisation on `/api/reservations/my`, and the admin route's RBAC. 22 tests.
