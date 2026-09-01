# Demo accounts & data

Created by `npm run db:seed:demo:full` (idempotent — safe to re-run). Every
account's password is **`demo1234`**. Demo-only records carry a `[DEMO]` tag in
visible text. The seed refuses to run against the test database and leaves any
real admin row untouched.

## Users — sign in at `/login` with the phone number

| Phone | Name | What this account exercises |
|-------|------|-----------------------------|
| `09120000101` | سارا محمدی | confirmed + pending + past reservations, one review — the "full dashboard" case |
| `09120000102` | رضا کریمی | only pending reservations |
| `09120000103` | نگار احمدی | fresh signup — no reservations (empty-state screen) |
| `09120000104` | امیر حسینی | one cancelled reservation |
| `09120000105` | مریم رستمی | confirmed past reservation + a review |
| `09120000106` | کاوه نادری | reservations across several cities |
| `09120000107` | لیلا صادقی | only finished (past) reservations |
| `09120000108` | بابک تهرانی | also an owner, with pending listings awaiting approval |

## Admins — sign in at `/admin/login` with the email

| Email | Role | Can |
|-------|------|-----|
| `viewer@rasamap.demo` | `viewer` | read the admin panel only — every write returns 403 |
| `editor@rasamap.demo` | `editor` | create / update billboards |
| `admin@rasamap.demo` | `admin` | + delete billboards, change reservation status |
| `superadmin@rasamap.demo` | `super_admin` | everything |

The real `super_admin` account already in the database is not modified.

## Records the seed creates

- **13 reservations** across every status (`pending`, `confirmed`, `cancelled`)
  and time position (future / current / past), spread over billboards 1–11.
- **3 owners** + **4 pending listings** (`[DEMO]`-tagged billboards with
  `status = "pending"` and an `ownerId`) — use these to demo the admin approval
  flow.
- **3 reviews**, only on billboards where the reviewing user has a confirmed
  reservation (the API enforces this).
- Billboard #1 set to `reserved` to reflect its confirmed future booking.

## Manual API testing

With the app running (`npm run dev`):

```bash
# public
curl -s 'http://localhost:3000/api/billboards?city=تهران&limit=3' | jq
curl -s 'http://localhost:3000/api/billboards/valiasr-tower' | jq
curl -s 'http://localhost:3000/api/stats' | jq

# user session
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"phone":"09120000101","password":"demo1234"}'
curl -s -b cookies.txt http://localhost:3000/api/reservations/my | jq
```

See [`api.md`](./api.md) for the full endpoint reference.
