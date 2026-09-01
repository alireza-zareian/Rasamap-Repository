# RUNBOOK

One page. Written while calm, for use when not. Rasamap = Next.js 16 + SQLite/Prisma,
single process, single DB file.

## If the site is down or broken — check in this order

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

## Rollback (target: under 2 minutes)

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

## Database backup & restore

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
Last run: row counts matched the source (3545 billboards / 1 user / 7 reservations),
`integrity_check` returned `ok`.

## Contacts / where things live

- Env vars: `.env.local` (never committed). Template: `.env.example`.
- Schema: `prisma/schema.prisma`. Migrations: `prisma/migrations/`.
- Seed: `npm run db:seed` (full) · `npm run db:seed:demo` (presentation dataset).
- Deploy gate: `PRE_DEPLOY_CHECKLIST.md`.
