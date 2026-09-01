# API Route Patterns

Read this file when writing or modifying API routes.

---

## Admin Route Template

Every admin route follows this exact order:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit, getIP } from "@/lib/auth/rate-limit";
import { z } from "zod";

export async function GET(req: NextRequest) {
  // 1. Auth
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Rate limit
  const rl = adminApiRateLimit(getIP(req));
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  // 3. Zod validation of query params
  const schema = z.object({ /* ... */ });
  const parsed = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid params" }, { status: 400 });

  // 4. Business logic
  const data = await someDbQuery(parsed.data);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
```

## User Route Template

```ts
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "user")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // business logic
}
```

## Public Route Template

```ts
export async function GET(req: NextRequest) {
  // Zod validate query params
  // Query DB via lib/db/billboards.ts
  return NextResponse.json(data);
}
```

---

## RBAC Roles

`super_admin > admin > editor > viewer > user`

Check: `hasPermission(session.role, "admin")` — returns true if session role ≥ required role.

- DELETE billboard: requires `admin`
- PUT/update billboard: requires `editor`
- GET admin routes: requires `viewer`

---

## Admin Billboard CRUD

| Method | Route | Role | Notes |
|---|---|---|---|
| GET | `/api/admin/billboards` | viewer+ | list with filters |
| POST | `/api/admin/billboards` | editor+ | create |
| PUT | `/api/admin/billboards/[id]` | editor+ | update |
| DELETE | `/api/admin/billboards/[id]` | admin+ | fails with 409 if active reservations exist |
| GET | `/api/admin/billboards/stats` | viewer+ | aggregate stats |

## Auth Endpoints (always public, bypass proxy)

| Method | Route | Notes |
|---|---|---|
| POST | `/api/auth/register` | phone regex `^09[0-9]{9}$`, bcrypt cost 12 |
| POST | `/api/auth/login` | rate-limited, timing-safe dummy hash |
| GET | `/api/auth/me` | returns session user or 401 |
| POST | `/api/auth/logout` | clears cookie |
| POST | `/api/admin/auth/login` | rate-limited, audit logged |
| POST | `/api/admin/auth/logout` | clears cookie |
| GET | `/api/admin/auth/me` | returns admin session |

## Reservation Endpoints (user auth required)

| Method | Route | Notes |
|---|---|---|
| GET | `/api/reservations?billboardId=X` | public — booked date ranges |
| POST | `/api/reservations` | user session required, overlap check |
| GET | `/api/reservations/my` | user session required, last 50 with billboard details |
