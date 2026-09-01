# PRE-DEPLOY CHECKLIST

Run through this every time before deploying or before a live demo. Tick each line.

## 1. Config & secrets
- [ ] `NODE_ENV=production` for the running process.
- [ ] `.env.local` (or the server's real env) has: `DATABASE_URL`, `AUTH_SECRET`
      (≥32 random chars), `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_NAME`,
      `NESHAN_API_KEY`, `NEXT_PUBLIC_NESHAN_KEY`.
- [ ] No secret is hardcoded in source: `git grep -nE "AUTH_SECRET|PASSWORD_HASH|API_KEY" -- '*.ts' '*.tsx'`
      returns only `process.env.*` references.
- [ ] `.env*` is git-ignored; only `.env.example` is tracked.
- [ ] Production database file is **not** the same file used in development.

## 2. Build & static
- [ ] `npm ci` completes clean.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes with no errors.
- [ ] `npm start` boots and the landing page renders.

## 3. Database
- [ ] `npx prisma migrate deploy` (or `prisma db push`) applied — schema matches
      `prisma/schema.prisma`, including composite indexes.
- [ ] A fresh backup exists from **today** (`npm run db:backup`) and a test restore
      has been done at least once (see `RUNBOOK.md` — done 2026-09-01).
- [ ] Demo/seed data is the intended dataset — no stray test reservations in the tables
      you will show.

## 4. Security
- [ ] Security headers present on a real response:
      `curl -sI https://<host>/ | grep -iE "content-security-policy|strict-transport|x-frame|x-content-type"`.
- [ ] Admin panel: hitting `/admin` and `/api/admin/billboards` while logged out
      redirects / returns 401.
- [ ] Rate limiting active: 6 rapid wrong logins to `/api/auth/login` → 429 + lockout.
- [ ] Object-level check: logged in as user A, requesting user B's reservation by ID
      does not return B's data.
- [ ] `npm audit` reviewed; no unpatched High/Critical, or each one is written down with
      a reason.

## 5. Error handling
- [ ] `/this-page-does-not-exist` shows the styled Persian 404, not a stack trace.
- [ ] Forcing a 500 (e.g. bad DB path) shows the styled Persian error page with a
      reference ID, no internals leaked.
- [ ] Every list has a designed empty state and a failure+retry state.

## 6. Version control & rollback
- [ ] Working tree clean, everything committed on `main`, `main` builds.
- [ ] A tag exists for the version being shown (e.g. `git tag demo-1405-06-14`).
- [ ] `RUNBOOK.md` rollback steps are current and you know the last-good commit/tag.

## 7. Final smoke test (do this last, on the real target)
- [ ] Register a new user → login → reserve a date range → see it in the dashboard.
- [ ] Admin login → edit a billboard → change reflected on the public page.
- [ ] Explore: filter by city + type + price, paginate, open a detail page, open the map.
- [ ] Open the site on a phone (or 390px devtools) — no horizontal scroll, buttons
      reachable.
