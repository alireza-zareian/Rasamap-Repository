# Demo accounts & data

Created by `npm run db:seed:demo:full` (idempotent — safe to re-run). Every
account's password is **`demo1234`**. Demo-only records carry a `[DEMO]` tag in
visible text. The seed refuses to run against the test database and leaves any
real admin row untouched.

## Users — sign in at `/login` with the phone number

| Phone | Name | What this account exercises |
|-------|------|-----------------------------|
| `09120000101` | سارا محمدی | two published listings + a review — the "full dashboard" case |
| `09120000102` | رضا کریمی | one listing awaiting admin review |
| `09120000103` | نگار احمدی | fresh signup — nothing submitted (empty-state screen) |
| `09120000104` | امیر حسینی | one rejected listing |
| `09120000105` | مریم رستمی | wrote a review, submitted nothing |
| `09120000106` | کاوه نادری | featured plan, still awaiting payment confirmation |
| `09120000107` | لیلا صادقی | featured listing, payment confirmed — shows the «ویژه» badge |
| `09120000108` | بابک تهرانی | also an owner, with pending listings awaiting approval |

## Admins — sign in at `/admin/login` with the email

| Email | Role | Can |
|-------|------|-----|
| `viewer@rasamap.demo` | `viewer` | read the admin panel only — every write returns 403 |
| `editor@rasamap.demo` | `editor` | create / update billboards |
| `admin@rasamap.demo` | `admin` | + delete billboards, approve/reject listings |
| `superadmin@rasamap.demo` | `super_admin` | everything |

The real `super_admin` account already in the database is not modified.

## Records the seed creates

- **8 listings** (`[DEMO]`-tagged) covering every state of the submission
  pipeline — `pending` (awaiting content review), `awaiting_payment` (featured
  plan, transfer not yet confirmed), `available` (published, one of them with
  the «ویژه» promotion granted) and `inactive` (rejected). Each is linked to the
  account that submitted it, so the admin approval queue shows a real submitter.
- **3 owners** (agency records the listings point at).
- **3 reviews** on published listings, with `billboards.rating` /
  `reviewCount` recomputed from them — the same aggregate the API maintains.

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
curl -s -b cookies.txt http://localhost:3000/api/listings | jq
```

See [`api.md`](./api.md) for the full endpoint reference.
