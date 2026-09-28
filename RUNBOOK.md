# رانبوک — اجرا، استقرار و حساب‌های دمو

> پیش‌تر سه فایل جدا: `RUNBOOK.md`، `PRE_DEPLOY_CHECKLIST.md` و `docs/demo-accounts.md`.


---

# رویه‌های اجرا و بازیابی

## RUNBOOK

One page. Written while calm, for use when not. Rasamap = Next.js 16 + SQLite/Prisma,
single process, single DB file.

> ## 🔴 Start it with `npm run demo` — never `npm run dev`
>
> `npm run demo` = `next build && node server.mjs` (`server.mjs` is `next start` plus
> the real client address — see its header). Measured: **9.7 s CPU (`dev`) vs
> 0.1 s (`start`)** for a first visit to ten routes — **~97×**. Idle production
> server: 0.16 s CPU per 10 s, 121 MB RSS. `dev` compiles each route on first
> click and watches 6710 files; on a fanless laptop that is the difference
> between cool and hot. Use `dev` only while editing code.
> Details: `docs/engineering-decisions.md` §22.

### If the site is down or broken — check in this order

1. **Is the process running?**
   - `ps aux | grep "server.mjs"` (or check the systemd/pm2 unit).
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

5. **The location map on a media page is blank?**
   - It is a Google Maps `iframe`, so it only appears if Google is reachable from the
     visitor's connection — on an Iranian mobile line it often is not. Nothing to fix:
     the coordinates and a "open in your map app" link are printed underneath for
     exactly this case. The rest of the page is unaffected.

6. **Data looks wrong (missing billboards, 0 prices)?**
   - Do **not** re-seed against the live DB in a panic. Restore from backup (below) into
     a copy first, compare, then decide.

### After pulling a new version

`npm run demo` applies pending migrations and regenerates the Prisma client before
it builds, so a pull needs no extra step. The migration of 2026-09-27 moved
sessions into the database: anyone signed in before it — on the laptop or a
phone — is signed out once and simply signs in again.

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

**Photos are not in the database.** Every photo an owner or an admin uploaded
lives in `UPLOAD_DIR` (default `storage/uploads/`, outside `public/`), and the
database only holds their addresses. A backup that is to restore listings with
their photos copies that folder alongside the `.db` file:
```bash
tar -czf backups/uploads-<timestamp>.tar.gz storage/uploads
```
Restored without it, those listings show the "no photo" placeholder rather than a
broken image. Photos written by versions before 2026-09-27 are still read from
`public/uploads/` — copy that folder too if it exists.

### First deployment to a real host

Templates are in `deploy/`. The order matters — the last step proves the three
headers rule 9 depends on actually arrive.

```bash
# on the server, as root
adduser --system --group --home /srv/rasamap rasamap
apt install -y nodejs npm nginx certbot python3-certbot-nginx sqlite3

# the code
git clone <repo> /srv/rasamap && cd /srv/rasamap
npm ci
npm run images:variants          # ← git-ignored; without this, images 404

# secrets, readable only by the service user
install -d -m 750 -o root -g rasamap /etc/rasamap
cp .env.example /etc/rasamap/env && chmod 640 /etc/rasamap/env
# fill in: DATABASE_URL AUTH_SECRET ADMIN_* NESHAN_API_KEY
#          NEXT_PUBLIC_BASE_URL=https://<your domain>
#          TRUSTED_PROXY_COUNT=1        ← exactly one nginx in front
chown root:rasamap /etc/rasamap/env

npx prisma migrate deploy && npm run db:seed    # `db:migrate` is `migrate dev`: never on a server
npm run build

cp deploy/rasamap.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now rasamap

cp deploy/nginx.conf.example /etc/nginx/sites-available/rasamap
ln -s /etc/nginx/sites-available/rasamap /etc/nginx/sites-enabled/
# the proxy headers: the commented block at the end of that file, on its own
sed -n 's/^#   //p' deploy/nginx.conf.example | sed -n '/proxy_http_version/,$p' \
  > /etc/nginx/snippets/rasamap-proxy.conf
mkdir -p /var/cache/nginx/rasamap
nginx -t && systemctl reload nginx
certbot --nginx -d <your domain>        # HTTPS, and the :80 redirect
# then add `http2 on;` to the :443 server block certbot wrote, and reload

cp deploy/rasamap-backup.* /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now rasamap-backup.timer
```

**The nightly data import is a separate, later step** — set it up once the site
is serving and a backup has been taken, never in the same sitting:

```bash
npm run db:sync-scraped                 # dry run first. READ the report.
npm run db:sync-scraped -- --apply      # the first run only adopts what is there
cp deploy/rasamap-sync.* /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now rasamap-sync.timer
journalctl -u rasamap-sync -n 40        # the next morning: what it wrote
```

The first run on an existing database writes no field and records what is
already there as the baseline — that is deliberate, and §33 says why. Anything
the feed has that the database does not is recorded as deliberately absent
(`--insert-absent` overrides). The timer fires at 01:30, an hour after the
backup, so a night that goes wrong can be undone from a backup taken before it.

**Rehearse all of this before renting anything.** A tunnel gives a real HTTPS
address, a real reverse proxy and a non-localhost host for free, which is every
condition the §24 bug class needs to show itself:

```bash
npm run demo
cloudflared tunnel --url http://localhost:3000     # prints an https://… URL
npm run images:check https://<that url>
```

**Then verify, from a phone on mobile data — not the office Wi-Fi:**

```bash
curl -s https://<domain>/api/health                  # {"status":"ok"}
curl -sI https://<domain>/ | grep -i strict-transport # HTTPS really terminated
```

- [ ] the site opens, and the catalogue shows photos
- [ ] signing in works **and stays signed in** — if it does not, `X-Forwarded-Proto`
      is not reaching the app and the session cookie is being dropped (§24)
- [ ] submitting a listing works — if it 403s, `X-Forwarded-Host` is missing
- [ ] `npm run images:check https://<domain>` passes against the live site
- [ ] restore a backup into a scratch file and count the rows (drill below)
- [ ] `curl -sI https://<domain>/ | grep -i x-cache` twice: `MISS`, then `HIT`

### Production: what nginx takes off the app

The demo laptop runs Node alone, and should. On a real host, everything that
is the same for every visitor can be answered before Node wakes up.
`deploy/nginx.conf.example` does each of these; this is what each one buys and
what it costs.

| In nginx | What it saves | Cost / limit |
|---|---|---|
| `/_next/static/` and `/images/` from disk | Node never serves a file | the hotlink rule is repeated in nginx, because proxy.ts never sees these requests |
| page cache (`proxy_cache`) | a page the app marks `s-maxage` (the landing page, `/about`) costs one render per 5 minutes, not one per visitor | see below |
| `gzip` | compression moves off the Node thread once `compress: false` is set in `next.config.ts` | only on this host: the laptop has no nginx and must keep compressing |
| upstream `keepalive` | no new TCP connection to Node per request | — |
| `http2 on` | one connection per visitor for all assets | added by hand after certbot |

**Measured** (this project, one sandbox machine, `test/bench.mjs`, 20
concurrent, 5 s): the landing page straight from Node served **226 req/s,
p50 85 ms**; through the nginx cache **1,079 req/s, p50 17 ms**. §38 measured
compression at 30–40 % of a request's CPU in Node; moving it to nginx was not
measured separately.

**What the page cache does not do.** It stores only what the app itself calls
shareable — `/explore`, anything `private`/`no-store`, and every `/api/` call
always reach Node, so rate limits and the JSON catalogue's copy budget (§20b)
still see every request. A signed-in visitor (`rasamap_session` cookie)
bypasses it. The one real trade-off: a cached page is answered without
proxy.ts, so the bot user-agent filter does not see those hits — they are
public pages, the same for everyone, and cost nothing to serve.

**The rest of the host:**

- `BIND_ADDRESS=127.0.0.1` (already in `rasamap.service`): nginx is the only
  way in, so nobody can skip it and forge `X-Forwarded-For`.
- `TRUSTED_PROXY_COUNT=1`: exactly one proxy. Two (a CDN in front of nginx)
  means `2`; a wrong number either trusts a forged address or rate-limits
  every visitor as one.
- **Restarts.** `systemctl restart rasamap` sends SIGTERM; `server.mjs` stops
  taking connections, lets requests in flight finish, and exits within 10 s.
  During those seconds nginx keeps serving cached pages
  (`proxy_cache_use_stale`); everything else answers 502 until Node is back.
- **SQLite stays one process** (§14). Do not start a second `npm run start`
  on the same file to "use more cores" — each process keeps its own cache and
  rate-limit counters (§25). The database file belongs on a local disk, never
  a network mount (WAL needs shared memory). Past one process, §27 moves it to
  PostgreSQL.
- Not used: brotli (not in stock nginx), a CDN (paid or unreachable from Iran).

### Images — after any fresh clone or restore

`next/image` here serves pre-built files rather than resizing on demand (§22c),
and those files live under `public/images/scraped/`, which is git-ignored along
with the photos themselves. **A fresh clone has none of them**, and the site
will show broken images until they are built:

```bash
npm run images:variants   # ~95 s from cold, seconds when only a few are missing
npm run images:check      # walks the public pages, fetches every src and every
                          # srcset candidate, fails loudly on the first 404
```

Re-run `images:variants` whenever new photos land in `public/images/scraped/`.
It skips what already exists, so running it again is cheap.

### Switching the database engine

SQLite is the engine and is meant to stay it (§14). The PostgreSQL path exists,
is proven, and is one command away — nothing switches on its own.

```bash
# a target to move to (any PostgreSQL; this is the one used for the trial run)
docker start rasamap-pg     # or: docker run -d --name rasamap-pg \
                            #       -e POSTGRES_PASSWORD=… -e POSTGRES_DB=rasamap \
                            #       -p 55432:5432 postgres:16-alpine

npm run db:to-postgres -- --dry-run postgresql://…   # read and plan, no writes
npm run db:to-postgres -- postgresql://…             # copy, fix sequences, verify
```

It reads every table out of SQLite, creates them on the target, copies parents
before children, advances the id sequences, and **counts both sides** — it will
not report success unless every table matches. Any failure puts the schema file
back on SQLite before exiting, and the SQLite database is only ever read.

Then put the new URL in `.env.local`, `npm run build && npm test`, and keep the
SQLite file: it is the rollback.

```bash
npm run db:to-sqlite        # schema and generated client back on SQLite
```

Two things that will bite if this is ever done by hand instead: the Prisma
client is generated per provider, so it must be regenerated after switching
(both commands do it); and PostgreSQL id sequences start at 1 regardless of the
ids you copied in, so without the sequence step the next insert collides with
row one. §27 has the detail.

### Running more than one instance (the shared cache)

Single process on one machine: do nothing. The cache lives in `.next/cache` and
that is the right answer — Redis is measurably *slower* on one box (§25).

The moment there is a second instance — two containers, a rolling deploy, a
load balancer — turn it on, or they will disagree about the catalogue:

```bash
brew services start redis          # or: redis-server --daemonize yes
# .env.local
REDIS_URL=redis://127.0.0.1:6379   # REDIS_PREFIX= if the Redis is shared
npm run demo
```

Verify it is actually being used, and that invalidation reaches every instance:

```bash
redis-cli --scan --pattern 'rasamap:cache:*' | head     # entries appear after a visit
redis-cli SMEMBERS rasamap:cache:tag:billboards         # what an admin write will clear
```

If Redis goes away, the app keeps serving — pages render uncached and one line
is logged. Nothing to do but restart Redis.

### Contacts / where things live

- Env vars: `.env.local` (never committed). Template: `.env.example`.
- Cache handler: `cache-handler.js` (loaded only when `REDIS_URL` is set).
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
      (≥32 random chars), `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_NAME`.
      `NESHAN_API_KEY` is optional — only the offline coordinate backfill reads it (§29).
- [ ] No secret is hardcoded in source: `git grep -nE "AUTH_SECRET|PASSWORD_HASH|API_KEY" -- '*.ts' '*.tsx'`
      returns only `process.env.*` references.
- [ ] `.env*` is git-ignored; only `.env.example` is tracked.
- [ ] Production database file is **not** the same file used in development.

### 2. Build & static

- [ ] `NEXT_PUBLIC_BASE_URL` is the real address. Unset, `lib/site-url.ts`
      defaults to `https://rasamap.ir`, and `robots.txt` and `sitemap.xml` then
      advertise a domain that is not the one being served — silently.
- [ ] `npm run images:variants` — the pre-built image sizes exist on the target.
- [ ] `npm run images:check` — every image on every public page resolves (this
      catches a missing variant directory, which a build will not).
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
- [ ] Sign in as a customer → submit a media item → see it pending in the dashboard →
      approve it in the admin panel → it appears on /explore.
- [ ] Admin login → edit a billboard → change reflected on the public page.
- [ ] Explore: filter by city + type + price, paginate, open a detail page, open the map.
- [ ] Open the site on a phone (or 390px devtools) — no horizontal scroll, buttons
      reachable.

---

# حساب‌ها و دادهٔ دمو

## Demo accounts & data

Created by `npm run db:seed:demo` (idempotent — safe to re-run). Every
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

### Admins — sign in at `/login?as=staff` with the email (`/admin/login` forwards there)

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
- **5 reviews** on published listings, with `billboards.rating` /
  `reviewCount` recomputed from them — the same aggregate the API maintains.
  Two of them sit on the one `featured` listing, because the catalogue sort puts
  that row first and an empty rating slot is the first thing a visitor would see.

### Manual API testing

With the app running (`npm run demo` — never `npm run dev`, §22):

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

See [`docs/api.md`](./docs/api.md) for the full endpoint reference.
