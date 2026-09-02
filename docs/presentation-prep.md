# Presentation & thesis-document prep

> For the day the thesis document / defense slides get built. A fresh agent
> should read this top to bottom, then walk the user through the parts marked
> **[user action]** (screenshots, live checks) and do the parts marked
> **[agent]** (assembling text, diagrams, verifying the build).
>
> The substance already exists — this file is a checklist and a map, not new
> work. Source docs, in the order you'd cite them:
>
> | Doc | What it carries |
> |-----|-----------------|
> | `docs/architecture.md` | the two data paths, kitchen analogy, perf comparison, why it isn't a headless DRF API — **must appear in every reviewer-facing report** |
> | `docs/engineering-decisions.md` | 16 decision records (Decision / Context / Structure / Why / Where / Verified) + milestone log — the spine of the "what we built and why" chapter |
> | `docs/presentation-summary.md` | defense-ready Persian summary + one-line opener |
> | `docs/api.md` | the ~28-endpoint HTTP reference (also served at `/api-docs`) |
> | `docs/AUDIT.md` / `PLAN.md` / `docs/security-audit.md` | production-readiness triage, 13-layer assessment, `npm audit` status |
> | `docs/STATUS.md` | current phase state + the "round two" work list |
> | `README.md` | the narrative intro (why Next.js → API combination → why SQLite) |

---

## 0. State of the project (as of 1405-06-12 / 2026-09-02)

- Build: clean. Lint: **0 warnings**. Tests: **57 / 57** (`npm test`).
- `next` 16.2.11 (10 CVEs patched). `npm audit`: remaining items are transitive
  build/dev tooling, not exploitable — see `docs/security-audit.md`.
- DB: **3532 billboards** after `npm run db:dedupe --apply` (17 cross-source
  duplicates removed; pre-dedupe backup in `backups/dev-*-pre-dedupe.db`).
- Internal grade: **A−** for a capstone (see `docs/self-assessment.md`).

---

## 1. Screenshots to capture  **[user action]**

Run `npm run dev`, then `npm run db:seed:demo:full` once (idempotent) so every
screen has realistic data. Accounts are in `docs/demo-accounts.md`. Capture on a
**normal desktop width** and repeat the starred ones on a **phone** (78% of
Iranian users are mobile — worth a "responsive" slide).

Public site:
- [ ] Landing `/` — hero + stats bar + featured gallery ★
- [ ] Explore `/explore` — filters open, grid of results, the co-located map/list
- [ ] Billboard detail `/billboard/<slug>` — gallery, specs chips, traffic meter,
      booking CTA, map ★
- [ ] Booking modal — step 1 with the **booked-range chips + clash warning**
      visible — submit a listing with a photo and watch it reach the admin queue ★
- [ ] Compare `/compare` with 2 boards + the CompareModal
- [ ] Login `/login` and the `/reset-password` 3-step flow (step 2 shows the
      "کد تست" line only because `OTP_DEV_ECHO=1` locally)
- [ ] Dashboard `/dashboard` — a user with listings in several states (pending / awaiting payment / published / rejected)
- [ ] **Reconcile the two legacy review aggregates before the demo.** Reviews
      written before the final review did not update the billboard's summary
      columns, so two seeded rows still claim more reviews than they have
      (e.g. `5.0/7` stored against `5.0/1` actual). Every review written from
      now on recomputes them, but these two predate that. One command:

      ```sql
      -- sqlite3 dev.db
      UPDATE billboards SET
        rating = (SELECT ROUND(AVG(rating),1) FROM reviews WHERE billboardId = billboards.id),
        reviewCount = (SELECT COUNT(*) FROM reviews WHERE billboardId = billboards.id)
      WHERE id IN (SELECT DISTINCT billboardId FROM reviews);
      ```

      This only touches rows that actually have reviews; the synthetic ratings
      on the ~3,500 scraped rows are left alone (they are seed data, and the
      card only shows a score when `reviewCount > 0`).
- [ ] 404 (`/nope`) and the styled error page

Admin (`docs/demo-accounts.md` → super-admin):
- [ ] Overview — stat cards (note "خوشه هم‌مکان" not "تکراری")
- [ ] Billboards tab — table, filters, EditModal, ImageManager with the
      click-to-enlarge lightbox
- [ ] Reservations tab — a row, then **click the billboard name** (opens the
      board for management) and **click the user name** (opens the customer sheet)
- [ ] Users tab — "حساب‌های مدیریت" section + "کاربران ثبت‌نام‌شده" table;
      open a customer → edit + "بازنشانی رمز" showing a generated password ★
- [ ] Quality tab — the explanatory note + an "اصلاح رکورد" button
- [ ] Log tab — both "زنده (حافظه)" and "پایدار (دیتابیس)"; to populate a
      `rate_limit_hit` row, hammer a booking POST ~60× from one IP first
- [ ] Admin panel on a **phone** — topbar not overflowing, tabs wrapping ★

Terminal / logs:
- [ ] The JSON `api_request` lines scrolling in the `npm run dev` terminal
- [ ] `logs/app.log` after some traffic (LOG_DIR is already set in `.env`) —
      shows `api_request`, an error with a `ref`, and `audit` lines in one file

Put the files anywhere; if they should live in the repo, `docs/screenshots/`
is git-tracked-friendly (images aren't in `.gitignore` there).

---

## 2. Live checks before the defense  **[user action]**

- [ ] `npm run build` passes, `npm test` green (re-run the morning of).
- [ ] `cp .env.example .env.local` on a fresh clone still boots (clean-machine
      setup was fixed — postinstall + migration drift).
- [ ] Phone on the same Wi-Fi opens the site (LAN IP) — data + images load.
      Tunnel fallback: `ssh -R 80:localhost:3000 nokey@localhost.run`.
- [ ] Dark/light toggle works; the phone's own dark mode does **not** override
      the site theme.
- [ ] Book a media as a user → it shows "pending" in the dashboard → confirm it
      as admin → the billboard's status flips to "reserved" → cancel → back to
      "available".
- [ ] Try to double-book the same dates → 409 with a Persian message, and the
      BookingModal blocks "next" before you even submit.

---

## 3. Talking points the questions will hit  **[agent assembles from source docs]**

1. **"Why doesn't every page call the API?"** — the two data paths + kitchen
   analogy from `docs/architecture.md`. Server Components reading the DB is the
   framework's recommended pattern and the faster path, not a shortcut.
2. **"Why SQLite for a database course?"** — `docs/engineering-decisions.md`
   §14 + README: WAL mode, real transactions, the same Prisma schema moves to
   Postgres by changing a connection string, not a rewrite. It's config, not
   architecture.
3. **"Is it secure?"** — §3 (JWT/RBAC, endpoint is the boundary), §4 (rate
   limiting with a non-spoofable IP + humane lockouts + one durable
   `rate_limit_hit` per lockout + a 50k-key cap), §5 (the idempotency guard:
   atomic overlap check in a transaction **and** a DB unique constraint — the
   "10 concurrent requests → exactly 1 row" test), §6 (Zod on every input, no
   raw SQL), §8 (audit trail).
4. **"How does logging work / why no Docker-ELK-Sentry?"** — §7 + §7a. The app
   already emits the structured lines a pipeline needs; capture and shipping
   are deployment steps that add no code. The path to add them is written out.
5. **"What did you leave out and why?"** — §16 (SMS built but dormant — a paid
   line isn't worth it for a demo, one env var switches it on), the P5–P10 /
   U5–U10 items in `docs/STATUS.md` (Postgres migration, `next/image`, PPR,
   marketing polish), all deliberate and documented.
6. **Numbers to have ready:** 3532 billboards, ~28 API endpoints, 57 tests,
   0 lint warnings, 10 CVEs patched, bundle 7.7 MB → 1.0 MB after the
   `lib/data.ts` split.

---

## 4. Document assembly  **[agent]**

- [ ] Pull the "what we built and why" chapter straight from
      `docs/engineering-decisions.md` — each §'s Decision/Context/Why is already
      written for a reader.
- [ ] Include the architecture diagram + kitchen analogy verbatim (adapted to
      tone) — required in any reviewer-facing report.
- [ ] The milestone-log table at the bottom of `engineering-decisions.md` is a
      ready-made timeline figure.
- [ ] ERD: the mermaid diagram in `README.md`. Regenerate from
      `prisma/schema.prisma` if the reviewer wants every column.
- [ ] API appendix: `docs/api.md` (or screenshot `/api-docs`).
- [ ] Self-assessment / rubric: `docs/self-assessment.md`.
- [ ] Persian, verb-final, no back-to-back English words in prose — the README
      already sets the register to match.

---

## 5. Optional, not blocking

- Postgres migration (config, not rewrite) — `engineering-decisions.md` §14 has
  the story if a reviewer pushes on it; don't do it before the defense.
- `next/image` for scraped images, PPR on explore, `useOptimistic` on the
  booking modal — `docs/STATUS.md` P5–P10.
- A cron to expire a paid `featured` slot after 30 days (right now a granted
  booking keeps the board "reserved" until an admin cancels it).
- Marketing polish (testimonials, brand bar, Enamad placeholder) —
  `docs/STATUS.md` U5.
