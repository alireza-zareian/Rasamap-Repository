# Rasamap — Project Reference

Read this file only when you need details on architecture, schema, auth, or phase status.

---

## File Map (important files)

```
app/
  page.tsx                        Landing page — "use client"
  explore/page.tsx                Browse/filter — "use client", fetches /api/billboards
  explore/map/page.tsx            redirect → /explore (map deferred; RealMap removed in cleanup)
  billboard/[slug]/page.tsx       Individual billboard detail — Server Component, generateMetadata
  dashboard/page.tsx              User dashboard — the caller's own listings from /api/listings
  login/page.tsx                  User login
  list-media/page.tsx             Owner listing wizard — POSTs to /api/listings (status "pending")
  admin/page.tsx                  Admin dashboard — "use client", uses /api/admin/*
  admin/login/page.tsx            Admin login
  api/
    billboards/route.ts           PUBLIC: GET all billboards from DB
    auth/register/route.ts        POST: user registration (phone + bcrypt + JWT)
    auth/login/route.ts           POST: user login (rate-limited)
    auth/me/route.ts              GET: current user session
    auth/logout/route.ts          POST: clears session cookie
    listings/route.ts             POST: submit media for review (user auth, image upload) | GET: the caller's own submissions
    admin/listings/route.ts       GET: the approval queue (editor+)
    admin/listings/[id]/decision/route.ts  POST: approve / reject (admin+) — the listing state machine
    admin/auth/login/route.ts     POST: admin login (bcrypt + JWT + audit)
    admin/auth/logout/route.ts    POST: clears admin session
    admin/auth/me/route.ts        GET: current admin session
    admin/billboards/route.ts     GET: admin billboard list (auth + rate-limit + Zod + DB)
    admin/billboards/[id]/route.ts PUT: update billboard (editor+) | DELETE: delete (admin+, refuses if reviewed)
    admin/billboards/stats/route.ts GET: aggregate stats
    admin/audit/route.ts          GET: { logs (in-memory), persisted (audit_logs table) } — admin+

lib/
  types.ts                        Domain types (Billboard, BillboardStatus, ...) + typeLabels — data-free, import anywhere
  data.ts                         Static + scraped billboard arrays + billboards.json (4 MB). Imported ONLY by prisma/seed.ts
  db/client.ts                    Prisma singleton (dev hot-reload safe)
  db/billboards.ts                getAllBillboards(), getById(), getBySlug(), createBillboard(), updateBillboard(), deleteBillboard(), hasActiveReservations()
  auth/session.ts                 JWT create/verify, cookie helpers: getSession(), getSessionFromRequest(), buildSessionCookieHeader(), buildLogoutCookieHeader()
  auth/users.ts                   Admin auth against the admins table + hasPermission() RBAC
  auth/audit.ts                   In-memory ring buffer 500 entries, auditLog()
  auth/rate-limit.ts              userLoginRateLimit, userApiRateLimit, adminApiRateLimit
  auth/useCurrentUser.ts          Client hook: { user, logout }
  iranLocations.ts                31 provinces + cascading cities + lat/lng lookup
  theme.tsx                       ThemeProvider + useTheme()

components/
  BillboardCard.tsx Grid + list card modes, Link to /billboard/[slug]
  admin/ListingsPanel.tsx  Approval queue — shows submitted photos, approve/reject
  CompareBar/CompareModal  Side-by-side comparison
  TrafficMeter.tsx  Circular traffic score gauge
  Topbar.tsx        Fixed header with user auth state
  Toast.tsx         Notifications

proxy.ts            Auth guard: /admin/* and /api/admin/* require non-user role; /dashboard/*, /list-media/* and /api/listings/* require any valid session; /api/auth/* always passes through. Also the anti-scraping layer: bot-UA block, per-IP budget on catalogue pages, hotlink protection on media
```

---

## Data Flow

```
Python scraper → scraper/data/billboards.json → prisma/seed.ts → SQLite dev.db
                                                                       ↓
                                                            /api/billboards (GET, public)
                                                            /api/admin/billboards (GET, auth)
                                                                       ↓
                                                     app/explore, app/admin, app/page.tsx
```

**Never import `everyBillboard`/`allBillboards`/`scrapedBillboards` from `lib/data.ts` in API routes. Use `getAllBillboards()` from `lib/db/billboards.ts`.**

Domain types + `typeLabels` live in `lib/types.ts` (data-free — safe to import anywhere). `lib/data.ts` holds the hand-written + scraped billboard arrays and a 4 MB `billboards.json` import; it is imported **only** by `prisma/seed.ts` at build time. Importing `lib/data.ts` from a client/page module ships the entire dataset into the browser bundle (this was a real ~6.7 MB regression, fixed 2026-09-01 by the `lib/types.ts` split).

---

## DB Schema (Prisma 7 + SQLite)

Models: `Owner`, `User`, `Admin`, `Billboard`, `Review`, `ContactRequest`, `IdempotencyKey`, `OtpCode`, `AuditLog`
(`Reservation` was removed in the 2026-09-02 review — see §17 of `engineering-decisions.md`.)

Key decisions:
- `Billboard.id`: `Int @id @default(autoincrement())` — explicit IDs can be inserted during seed
- Arrays (`images`, `features`, `nearbyLandmarks`) and `TrafficData`: stored as `Json` — Prisma returns pre-parsed (no `JSON.parse` needed)
- `Admin` table backs admin login; `AuditLog` (`audit_logs`) stores durable admin-action records (see persistAudit)
- `ContactRequest` (`contact_requests`) is the lead table: one row per (billboard, user) that asked for the owner's phone, unique on the pair, with an atomic `count` for repeats and a `new | contacted | closed` follow-up state (§23)

Prisma 7 adapter pattern:
```ts
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
```

---

## Auth System

### Admin auth (implemented)
- Credentials from env vars: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_NAME`
- Login: `POST /api/admin/auth/login` → bcrypt verify → JWT → HttpOnly cookie
- Roles: `super_admin > admin > editor > viewer` (RBAC via `hasPermission()`)
- Rate limit: 5 login attempts / 15 min → lockout; 120 API req/min per IP

### User auth (implemented)
- Register: `POST /api/auth/register` — phone (Iranian mobile `^09[0-9]{9}$`), name (min 2), password (min 6)
- Login: `POST /api/auth/login` — DUMMY_HASH for timing-safe response when user not found
- Session role: `"user"`

### In-memory state (resets on restart, Phase 8 will DB-migrate)
- Rate limiter: `Map<string, Window>`, cleaned every 5 min
- Audit log: ring buffer, last 500 entries

---

## Type System

```ts
type BillboardType   = "billboard" | "digital" | "bridge" | "station" | "vehicle"
type BillboardStatus = "available" | "busy" | "reserved" | "inactive"

interface TrafficData {
  daily: number          // vehicles/day
  peakHour: string
  congestionLevel: number // 1–10
  pedestrian: number     // walkers/day
  estimatedViews: number // unique ad exposures/day
  viewabilityScore: number // 0–100
}
```

`vehicle` type: defined but no billboards use it. Excluded from explore filter chips.

---

## Coordinate Systems

- `mapX` / `mapY`: percentage-based positions (legacy — the schematic map component was removed)
- `lat` / `lng`: WGS-84 — optional, populated by Neshan geocoding (the Leaflet map component was removed in cleanup; restore from git if map work resumes)

Never mix them.

---

## Phase Roadmap

| Phase | Status | What |
|---|---|---|
| 1–5 | ✅ Done | Design, ERD, DB schema, public API, admin panel + auth |
| 6 | ✅ Done | Admin CRUD (POST/PUT/DELETE billboard routes) |
| 7 | ⬜ Future | Owner accounts (list-media flow) |
| 8 | ⬜ Future | Migrate in-memory admin users + audit log → DB |

---

## Stubs / deferred

- **Map:** `app/explore/map` redirects to `/explore`; the Leaflet component was removed in cleanup (restore from git if MAP-* work resumes).

---

## Known Issues

- `dev.db` is git-ignored; demo data is `[DEMO]`-tagged and separate from real data
- Rate limiter is in-memory: useless after restart or multi-instance
- Rate limiter + in-memory audit buffer reset on restart (durable audit rows persist)
- No CSRF beyond `SameSite=Strict`
- `script-src 'unsafe-inline' 'unsafe-eval'` in CSP (required by Leaflet CDN)
- Scraper commits data directly to main branch — no image eviction policy
