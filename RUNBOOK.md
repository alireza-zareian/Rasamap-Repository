# رانبوک — اجرا، استقرار و حساب‌های دمو

> پیش‌تر سه فایل جدا: `RUNBOOK.md`، `RUNBOOK.md` و `RUNBOOK.md`.


---

# رویه‌های اجرا و بازیابی

## RUNBOOK

One page. Written while calm, for use when not. Rasamap = Next.js 16 + SQLite/Prisma,
single process, single DB file.

> ## 🔴 Start it with `npm run demo` — never `npm run dev`
>
> `npm run demo` = `next build && next start`. Measured: **9.7 s CPU (`dev`) vs
> 0.1 s (`start`)** for a first visit to ten routes — **~97×**. Idle production
> server: 0.16 s CPU per 10 s, 121 MB RSS. `dev` compiles each route on first
> click and watches 6710 files; on a fanless laptop that is the difference
> between cool and hot. Use `dev` only while editing code.
> Details: `docs/engineering-decisions.md` §22.

### If the site is down or broken — check in this order

1. **Is the process running?**
   - `ps aux | grep "next start"` (or check the systemd/pm2 unit).
   - Restart: `npm start` (or `pm2 restart rasamap` / `systemctl restart rasamap`).
   - Watch the first 20 lines of output for a stack trace.

2. **Did it fail to boot?** Almost always one of:
   - Missing env var → error mentions `AUTH_SECRET` / `DATABASE_URL` / `ADMIN_*`.
     Fix `.env.local`, restart.
   - Bad `DATABASE_URL` path → `SQLITE_CANTOPEN`. Point it at the real `dev.db`, restart.
   - Port already in use → kill the stale process (`lsof -i :3000`), restart.

3. **Boots but pages 500?**
   - Check logs for the reference ID the user saw, then the traceback next to it.
   - Most common: schema drift → run `npx prisma migrate deploy` (or `prisma db push`),
     restart.
   - Prisma client stale after a dependency change → `npx prisma generate`, rebuild,
     restart.

4. **Database locked / writes hang?**
   - SQLite has a single writer. Check for a stuck process holding the file
     (`fuser dev.db` / `lsof dev.db`), kill it.
   - Stale WAL: stop the app, `sqlite3 dev.db "PRAGMA wal_checkpoint(TRUNCATE);"`,
     restart.

5. **Map is blank / "API Key Required"?**
   - `NEXT_PUBLIC_NESHAN_KEY` missing or invalid, or Neshan is unreachable. The rest of
     the site is unaffected — for a demo, use the grid/list view and say the map layer
     depends on an external provider.

6. **Data looks wrong (missing billboards, 0 prices)?**
   - Do **not** re-seed against the live DB in a panic. Restore from backup (below) into
     a copy first, compare, then decide.

### Rollback (target: under 2 minutes)

Precondition: repo is under git and each demo version is tagged.

```bash
# 1. find the last known-good version
git tag --list 'demo-*'          # or: git log --oneline -10

# 2. go back to it
git stash            # if there are local edits worth keeping
git checkout <tag-or-commit>

# 3. reinstall deps only if package-lock changed, then rebuild + restart
npm ci               # skip if lockfile unchanged
npx prisma generate
npm run build
npm start            # or restart the service manager
```

If the schema also moved backward: restore the matching DB backup (below) **before**
starting the app.

### Database backup & restore

**Backup** (safe to run while the app is up — SQLite online backup):
```bash
npm run db:backup                    # -> ./backups/dev-<timestamp>.db, keeps the last 10
BACKUP_DIR=/mnt/backups npm run db:backup   # custom destination
```
Under the hood: `sqlite3 dev.db ".backup '<dest>'"` (WAL-safe). Script:
`scripts/backup-db.sh`. Schedule it with cron for an automated dump, e.g.
`0 3 * * * cd /path/to/rasamap && BACKUP_DIR=/mnt/backups npm run db:backup`.

**Restore:**
```bash
# stop the app first
cp backups/dev-<timestamp>.db dev.db
rm -f dev.db-shm dev.db-wal      # drop stale WAL side-files
npm start
```

**Test restore — verified 2026-09-01.** Procedure: copy a backup to a throwaway
file, drop its stale `-shm`/`-wal`, then check it:
```bash
cp backups/dev-<timestamp>.db /tmp/restore-test.db
rm -f /tmp/restore-test.db-shm /tmp/restore-test.db-wal
sqlite3 /tmp/restore-test.db "PRAGMA integrity_check; SELECT count(*) FROM billboards;"
```
Last run: row counts matched the source (3532 billboards / users / listings),
`integrity_check` returned `ok`.

### Contacts / where things live

- Env vars: `.env.local` (never committed). Template: `.env.example`.
- Schema: `prisma/schema.prisma`. Migrations: `prisma/migrations/`.
- Seed: `npm run db:seed` (full) · `npm run db:seed:demo` (presentation dataset).
- Deploy gate: `RUNBOOK.md`.

---

# چک‌لیست پیش از استقرار

## PRE-DEPLOY CHECKLIST

Run through this every time before deploying or before a live demo. Tick each line.

### 1. Config & secrets
- [ ] `NODE_ENV=production` for the running process.
- [ ] `.env.local` (or the server's real env) has: `DATABASE_URL`, `AUTH_SECRET`
      (≥32 random chars), `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_NAME`,
      `NESHAN_API_KEY`, `NEXT_PUBLIC_NESHAN_KEY`.
- [ ] No secret is hardcoded in source: `git grep -nE "AUTH_SECRET|PASSWORD_HASH|API_KEY" -- '*.ts' '*.tsx'`
      returns only `process.env.*` references.
- [ ] `.env*` is git-ignored; only `.env.example` is tracked.
- [ ] Production database file is **not** the same file used in development.

### 2. Build & static
- [ ] `npm ci` completes clean.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes with no errors.
- [ ] `npm start` boots and the landing page renders.

### 3. Database
- [ ] `npx prisma migrate deploy` (or `prisma db push`) applied — schema matches
      `prisma/schema.prisma`, including composite indexes.
- [ ] A fresh backup exists from **today** (`npm run db:backup`) and a test restore
      has been done at least once (see `RUNBOOK.md` — done 2026-09-01).
- [ ] Demo/seed data is the intended dataset — no stray `[DEMO]` listings in the tables
      you will show.

### 4. Security
- [ ] Security headers present on a real response:
      `curl -sI https://<host>/ | grep -iE "content-security-policy|strict-transport|x-frame|x-content-type"`.
- [ ] Admin panel: hitting `/admin` and `/api/admin/billboards` while logged out
      redirects / returns 401.
- [ ] Rate limiting active: 6 rapid wrong logins to `/api/auth/login` → 429 + lockout.
- [ ] Object-level check: logged in as user A, `GET /api/listings` never returns user B's submissions
      does not return B's data.
- [ ] `npm audit` reviewed; no unpatched High/Critical, or each one is written down with
      a reason.

### 5. Error handling
- [ ] `/this-page-does-not-exist` shows the styled Persian 404, not a stack trace.
- [ ] Forcing a 500 (e.g. bad DB path) shows the styled Persian error page with a
      reference ID, no internals leaked.
- [ ] Every list has a designed empty state and a failure+retry state.

### 6. Version control & rollback
- [ ] Working tree clean, everything committed on `main`, `main` builds.
- [ ] A tag exists for the version being shown (e.g. `git tag demo-1405-06-14`).
- [ ] `RUNBOOK.md` rollback steps are current and you know the last-good commit/tag.

### 7. Final smoke test (do this last, on the real target)
- [ ] Register a new user → login → reserve a date range → see it in the dashboard.
- [ ] Admin login → edit a billboard → change reflected on the public page.
- [ ] Explore: filter by city + type + price, paginate, open a detail page, open the map.
- [ ] Open the site on a phone (or 390px devtools) — no horizontal scroll, buttons
      reachable.

---

# حساب‌ها و دادهٔ دمو

## Demo accounts & data

Created by `npm run db:seed:demo:full` (idempotent — safe to re-run). Every
account's password is **`demo1234`**. Demo-only records carry a `[DEMO]` tag in
visible text. The seed refuses to run against the test database and leaves any
real admin row untouched.

### Users — sign in at `/login` with the phone number

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

### Admins — sign in at `/admin/login` with the email

| Email | Role | Can |
|-------|------|-----|
| `viewer@rasamap.demo` | `viewer` | read the admin panel only — every write returns 403 |
| `editor@rasamap.demo` | `editor` | create / update billboards |
| `admin@rasamap.demo` | `admin` | + delete billboards, approve/reject listings |
| `superadmin@rasamap.demo` | `super_admin` | everything |

The real `super_admin` account already in the database is not modified.

### Records the seed creates

- **8 listings** (`[DEMO]`-tagged) covering every state of the submission
  pipeline — `pending` (awaiting content review), `awaiting_payment` (featured
  plan, transfer not yet confirmed), `available` (published, one of them with
  the «ویژه» promotion granted) and `inactive` (rejected). Each is linked to the
  account that submitted it, so the admin approval queue shows a real submitter.
- **3 owners** (agency records the listings point at).
- **3 reviews** on published listings, with `billboards.rating` /
  `reviewCount` recomputed from them — the same aggregate the API maintains.

### Manual API testing

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
