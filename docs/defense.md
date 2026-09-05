# دفاع — خلاصه، آمادگی، بازبینی نهایی و خودارزیابی

> پیش‌تر چهار فایل جدا: `defense.md`، `defense.md`،
> `defense.md` و `defense.md`. هر چهار برای یک روز نوشته شده بودند.
>
> سند تحویلی و اسلایدها جای دیگری‌اند: `docs/thesis/thesis.pdf` و `docs/defense-slides.html`.


---

# خلاصهٔ دفاع

## رسامپ — خلاصه‌ی ارائه

سندی برای جلسه‌ی دفاع: پروژه چیست، چطور مهندسی شده، کدام نگرانی‌های پروداکشن حل
شده و چطور، چه چیزی عمداً کنار گذاشته شده و چرا، و محدودیت‌های صادقانه‌ی شناخته‌شده.

---

### ۱. پروژه چیست

رسامپ یک فهرستِ آنلاین از رسانه‌های تبلیغاتی محیطی (بیلبورد) ایران است. کاربر
بین حدود ۳۵۰۰ رسانه جست‌وجو و فیلتر می‌کند، صفحه‌ی جزئیات را می‌بیند، و پس از
ثبت‌نام با شماره‌ی موبایل، شماره‌ی تماسِ صاحبِ رسانه را می‌بیند و مستقیم توافق
می‌کند. صاحبانِ رسانه هم آگهیِ خود را ثبت می‌کنند و پس از تأییدِ مدیر منتشر
می‌شود — درآمدِ پلتفرم از همین سمت است. یک پنلِ مدیریتیِ جدا هم برای رسیدگی به
رسانه‌ها و تأییدِ آگهی‌ها هست. رابطِ کاربری کاملاً فارسی و راست‌به‌چپ است.

> رسامپ مالکِ رسانه‌ها نیست و واسطه‌ی مالی نیست، پس عمداً جریانِ «رزرو آنلاین»
> ندارد؛ چیزی که در اختیار ندارد را نمی‌فروشد. دلیل در §۱۷ سندِ تصمیم‌ها.

**پشته:** Next.js 16 (App Router)، React 19، TypeScript در حالتِ strict، پایگاه
داده‌ی SQLite از طریقِ Prisma 7، احراز هویت با JWT در کوکیِ HttpOnly، نقشه با
Leaflet. یک اسکریپرِ Python هم داده‌ی اولیه را از چند سایتِ ایرانی جمع می‌کند.

**مقیاسِ واقعی:** بارِ خواندن‌محور، یک فایلِ SQLite، یک نمونه‌ی اجرا، چند کاربرِ
هم‌زمان در جلسه‌ی دفاع. یک محصولِ پرترافیک نیست و قرار هم نیست باشد.

---

### ۲. معماری

کلِ اپلیکیشن — رابطِ کاربری، مسیرهای API و رندرِ سمت سرور — در یک پایگاه کد است.

**دو مسیرِ داده، هر دو عمدی:**

1. **مرورگر به API.** همه‌ی صفحه‌های کلاینتی با `fetch("/api/...")` کار می‌کنند،
   چون پس از بارگذاری به داده‌ی تازه و تعاملی نیاز دارند — فیلتر، صفحه‌بندی، ثبتِ آگهی.
2. **سرور به پایگاه داده.** فقط صفحه‌ی جزئیاتِ رسانه یک Server Component است که
   هنگامِ رندر مستقیم لایه‌ی داده را صدا می‌زند: یک پرش، بدونِ تبدیل به JSON،
   بدونِ درخواستِ شبکه‌ی سرور به خودش. این الگوی پیشنهادیِ خودِ Next.js است.

هر دو مسیر از **یک لایه‌ی داده** (`lib/db/billboards.ts`) عبور می‌کنند؛ یک منبعِ
حقیقت، بدونِ کدِ تکراری. یک فریم‌ورکِ headless (مثل Django + DRF) فقط مسیرِ API را
دارد چون رابطِ کاربریِ رندرشده‌ی سمت سرور ندارد؛ Next.js هر دو را دارد و هرکدام را
جایی به کار می‌برد که سریع‌تر است.

شرحِ کامل + جدولِ مقایسه‌ی کارایی + تشبیهِ «رستوران/آشپزخانه» در
[`architecture.md`](./architecture.md). شرحِ تک‌تکِ سیستم‌ها (چه هست، چه ساختاری
می‌سازد، چرا، کجا) در [`engineering-decisions.md`](./engineering-decisions.md).

---

### ۳. نگرانی‌های پروداکشن که حل شد

از یک چک‌لیستِ ۱۳ لایه‌ای شروع کردیم و هر مورد را «لازم / ارزشش را دارد / زیادی»
سنجیدیم و فقط دو دسته‌ی اول را پیاده کردیم.

#### امنیت و احراز هویت

- هر مسیرِ API با ترتیبِ ثابت: بررسیِ سشن، محدودیتِ نرخ، اعتبارسنجیِ Zod، سپس منطق.
- JWT با الگوریتمِ HS256 در کوکیِ HttpOnly و SameSite=Strict؛ `bcrypt` با هزینه‌ی
  ۱۲؛ ورود همیشه `bcrypt` را اجرا می‌کند (حتی وقتی کاربر نیست) تا از حمله‌ی زمانی
  جلوگیری شود؛ پاسخِ «رمزِ غلط» و «کاربرِ ناموجود» کاملاً یکسان است.
- نقش‌ها: `viewer < editor < admin < super_admin` به‌علاوه‌ی `user`. مرزِ امنیت
  خودِ مسیر است، نه رابطِ کاربری — با تست ثابت شده که نقشِ `viewer` روی نوشتن ۴۰۳
  می‌گیرد و کاربر نمی‌تواند آگهیِ کاربرِ دیگر را ببیند.
- اعتبارسنجیِ Zod روی همه‌ی ورودی‌ها؛ فقط ORM (بدونِ SQLِ رشته‌ای)؛ allowlist برای
  هر مقداری که به‌عنوانِ شناسه واردِ کوئری می‌شود (کلیدِ مرتب‌سازی، نوع، وضعیت).
- هدرهای امنیتی + CSP در `next.config.ts`.
- ارتقای `next` به ۱۶.۲.۱۱ که ۱۰ اعلانِ امنیتی را بست، از جمله یک دورزدنِ گاردِ
  Proxy در App Router.

#### محدودیتِ نرخ و رفتار زیرِ بار

- پنجره‌ی لغزان بر پایه‌ی IP و کاربر، با سطل‌های نام‌دار (ورود ۱۰ در ۱۵ دقیقه،
  ثبت‌نام ۵ در ساعت، API عمومی ۶۰ در دقیقه، ...). پس از عبور از سقف، قفلِ موقت +
  ثبت در لاگ.
- IP از یک هلپر گرفته می‌شود که مقدارِ پروکسیِ **مورد اعتماد** را می‌خواند، نه
  نخستین مقدارِ `X-Forwarded-For` که کلاینت می‌تواند جعل کند.
- **Idempotency-Key** (هدرِ اختیاری) روی ثبتِ رسانه: کلیدِ تکراری همان
  پاسخِ قبلی را برمی‌گرداند، نه رکوردِ دوم. + قیدِ unique در پایگاه داده روی
  `(بیلبورد، کاربر، تاریخِ شروع، تاریخِ پایان)`.
- تصمیمِ تأیید/ردِ آگهی فقط یک‌بار پذیرفته می‌شود: بارِ دوم ۴۰۹ می‌گیرد، پس یک
  آگهیِ منتشرشده دوباره تأیید نمی‌شود و پروموشنِ پولی دوباره داده نمی‌شود.
- ثبتِ نظر و بازمحاسبه‌ی میانگینِ امتیازِ رسانه داخلِ یک تراکنش انجام می‌شود، پس
  جدولِ نظرات و ستونِ خلاصه هیچ‌وقت با هم اختلاف پیدا نمی‌کنند.
- آپلودِ تصویر: نوعِ فایل از روی بایت‌های ابتدایی خودِ فایل تشخیص داده می‌شود، نه
  از چیزی که مرورگر ادعا می‌کند؛ نامِ فایل را سرور می‌سازد (بدونِ traversal).
- صفحه‌بندیِ سمت سرور روی همه‌ی فهرست‌ها؛ payload صرف‌نظر از حجمِ دیتاست محدود
  می‌ماند.

#### پایداری و مشاهده‌پذیری

- صفحه‌های خطای فارسیِ استایل‌خورده برای ۴۰۰/۴۰۳/۴۰۴/۵۰۰ + مرزِ خطای کلاینت.
  کاربر یک پیامِ آرام + یک **کدِ خطای کوتاه** می‌بیند؛ traceback فقط در لاگ.
- لاگِ ساخت‌یافته: هر خط یک شیءِ JSON روی stdout، و در صورتِ تنظیمِ `LOG_DIR` روی
  یک فایلِ چرخشی. بدونِ هیچ وابستگیِ بیرونی. هرگز رمز/توکن/شماره در لاگ نمی‌رود.
- **هر مسیرِ API** یک خطِ `api_request` می‌دهد: مسیر، متد، وضعیت، مدت.
- ثبتِ ممیزیِ پایدار برای کارهای مدیر (ساخت/ویرایش/حذفِ رسانه، تأیید/ردِ آگهی)
  در جدولِ `audit_logs` — بعد از ری‌استارت هم می‌ماند. در پنلِ مدیر قابلِ دیدن است.

#### بازیابی و استقرار

- اسکریپتِ نسخه‌ی پشتیبانِ آنلاینِ SQLite (`npm run db:backup`)، نگه‌داشتنِ ۱۰
  نسخه‌ی آخر، با یک بازیابیِ **آزموده‌شده و ثبت‌شده** (شمارشِ ردیف‌ها و
  `PRAGMA integrity_check`).
- `RUNBOOK.md` و `RUNBOOK.md`: چه چیزی را قبل از هر استقرار چک کنیم،
  و اگر اپ خوابید اول/دوم/سوم چه کنیم و چطور در کمتر از دو دقیقه به نسخه‌ی قبلی
  برگردیم.
- اعتبارسنجیِ fail-closedِ متغیرهای محیطی هنگامِ بالا آمدن (`lib/env.ts`): اگر
  متغیرِ الزامی نباشد، سرور با پیامِ روشن متوقف می‌شود، نه با یک مقدارِ پیش‌فرضِ
  ناامن.

#### کیفیت

- سوییتِ آزمونِ بدونِ وابستگی (`npm test`): `node:test` داخلیِ Node در برابرِ یک
  سرورِ واقعیِ Next روی یک پایگاه داده‌ی تستِ جدا — نه `dev.db`. ۳۷ آزمون:
  اعتبارسنجی، allowlistها، محدودیتِ نرخ، عدمِ نشتِ نامِ کاربری، گاردِ هم‌زمانیِ
  ثبتِ آگهی، دسترسیِ سطحِ رکورد، RBAC، و ممیزیِ پایدار.
- سنجشِ بار (`npm run bench`): روی حالتِ توسعه حدود ۱۰۸ درخواست بر ثانیه؛ گلوگاهِ
  اول زیرِ بارِ نوشتن، قفلِ تک‌نویسنده‌ی SQLite است — که صریح گفته‌ایم.
- `tsc` بدونِ خطا؛ `npm run lint` بدونِ ارور (۱۰ هشدارِ باقی‌مانده مستند و
  پذیرفته‌شده).
- تاریخچه‌ی git تمیز، ریپوی خصوصی روی GitHub، مهاجرت‌ها هماهنگ (‏`git clone` تازه
  → `npm ci` → `migrate deploy` → `db:seed` از صفر کار می‌کند).

---

### ۴. چه چیزی عمداً کنار گذاشته شد و چرا

| مورد | چرا کنار گذاشته شد |
|---|---|
| **PostgreSQL** | SQLite برای بارِ خواندن‌محور + یک نقطه‌ی نوشتن + یک نمونه‌ی اجرا ابزارِ درست است. لایه‌ی داده طوری ساخته شده که مهاجرت یک تغییرِ پیکربندی باشد نه بازنویسی. Postgres قدمِ بعدی است، نه کمبود. |
| **CI/CD** | برای یک اپِ تک‌نفره که محلی/روی سرورِ خصوصی دمو می‌شود، سربارش از ارزشش بیشتر است. تست‌ها با `npm test` محلی اجرا می‌شوند. |
| **Redis برای rate-limit و ممیزیِ درون‌حافظه** | یک نمونه‌ی اجرا. ری‌استارت که شمارنده‌ها را پاک کند قابلِ قبول است و صریح گفته شده. (ردیف‌های ممیزیِ پایدار می‌مانند.) |
| **استکِ Grafana/Loki** | معادلِ رایگانِ self-hosted همان «لاگِ JSON در فایلِ چرخشی» است. یک استکِ کاملِ رصد برای دمو زیادی است. |
| **`next/image`، PPR، streaming، `useOptimistic`** | تیونینگِ افزایشی، نه تغییرِ معماری. برای بعد از ارائه. |
| **Load balancing، read replica، multi-tenancy، CDN، container orchestration** | مالِ سامانه‌های بزرگ‌ترند؛ برای این مقیاس بی‌معنی. |
| **سرویس‌های SaaSِ پولی یا مسدود** (Sentry, Auth0, Vercel Pro, ...) | نه دسترسی، نه لازم. هر جا یک بهترین‌روش به سرویسِ پولی وابسته بود، معادلِ درون‌کدش را ساختیم. |

---

### ۵. محدودیت‌های صادقانه‌ی شناخته‌شده

- **نوشتنِ هم‌زمان:** SQLite در لحظه یک نویسنده دارد. زیرِ بارِ سنگینِ نوشتن،
  `POST /api/listings` نخستین جایی است که کند می‌شود. مسیرِ ارتقا: Postgres.
- **یک نمونه‌ی اجرا:** محدودیتِ نرخ و بافرِ ممیزیِ درون‌حافظه با ری‌استارت پاک
  می‌شوند و بینِ چند نمونه مشترک نیستند.
- **CSP:** برای Leaflet مجبوریم `script-src` را با `'unsafe-inline'` و
  `'unsafe-eval'` باز بگذاریم. یک سازشِ مستند.
- **لایه‌ی نقشه:** به یک کلیدِ Neshan وابسته است؛ بدونِ آن بقیه‌ی سایت کار می‌کند
  ولی نقشه خالی می‌ماند. تحقیقِ ارائه‌دهنده (Neshan / CARTO / OSM) عمداً به بعد از
  ارائه موکول شده.
- **هشدارهای `npm audit`:** ۱۲ مورد باقی مانده، همه در ابزارِ build/dev یا در یک
  قابلیتِ استفاده‌نشده (`next/image`، درایورِ MySQL). هیچ‌کدام از ورودیِ کاربر در
  زمانِ اجرا قابلِ دسترسی نیستند — جدولِ کامل در `STATUS.md`.
- **ریسپانسیو:** تورِ ایمنیِ CSS هست و همه‌ی گریدهای چندستونه زیرِ ۶۴۰ پیکسل
  تک‌ستون می‌شوند، ولی یک بازبینیِ نهایی با مرورگرِ واقعی روی موبایل هنوز مانده.

---

### ۶. جمله‌ی یک‌خطی برای شروعِ ارائه

> «رسامپ یک فهرستِ آنلاینِ بیلبورد است که با Next.js ساخته شده — یک پایگاه کد که
> هم رابطِ کاربری را رندر می‌کند هم API را سرو می‌کند. از SQLite استفاده می‌کنیم
> چون برای این بارِ کاری ابزارِ درست است، و همه‌چیز از یک لایه‌ی داده رد می‌شود
> تا مهاجرت به Postgres در آینده فقط یک تغییرِ پیکربندی باشد. امنیت، مدیریتِ
> خطا، محدودیتِ نرخ، هم‌زمانی و بازیابی همه پیاده و آزموده شده‌اند؛ چیزهایی
> که کنار گذاشتیم را هم می‌دانیم و می‌توانیم بگوییم چرا.»

---

# چک‌لیست آمادگی ارائه

## Presentation & thesis-document prep

> # 🔴 ⛔ RULE ZERO — read this before anything else on this page
>
> ## On demo day, start the site with `npm run demo`. **Never** `npm run dev`.
>
> | Mode | CPU for a first visit to 10 routes |
> |---|---|
> | `npm run dev` | **9.7 s** |
> | `npm run demo` (`next build && next start`) | **0.1 s** |
>
> ### ~97× less CPU.
>
> The demo runs on the author's fanless MacBook Air. In `dev` mode, clicking
> through pages and the admin panel makes the laptop hot and loud — during the
> defense. `next build` does the compiling once, ahead of time. Build it
> **before** the session starts, not while the examiners are watching.
>
> **[agent] This belongs in the thesis document**, with the number and the
> reason — it is a defensible engineering decision, not a footnote. Full write-up:
> `docs/engineering-decisions.md` §22 (and §22a for the image-weight half).
>
> **[user action] Run `npm run demo` and leave it running before the defense begins.**

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
> | `defense.md` | defense-ready Persian summary + one-line opener |
> | `docs/api.md` | the ~28-endpoint HTTP reference (also served at `/api-docs`) |
> | `STATUS.md` / `docs/STATUS.md` / `STATUS.md` | production-readiness triage, 13-layer assessment, `npm audit` status |
> | `docs/STATUS.md` | current phase state + the "round two" work list |
> | `README.md` | the narrative intro (why Next.js → API combination → why SQLite) |

---

### 0. State of the project (as of 1405-06-12 / 2026-09-02)

- Build: clean. Lint: **0 warnings**. Tests: **57 / 57** (`npm test`).
- `next` 16.2.11 (10 CVEs patched). `npm audit`: remaining items are transitive
  build/dev tooling, not exploitable — see `STATUS.md`.
- DB: **3532 billboards** after `npm run db:dedupe --apply` (17 cross-source
  duplicates removed; pre-dedupe backup in `backups/dev-*-pre-dedupe.db`).
- Internal grade: **A−** for a capstone (see `defense.md`).

---

### 1. Screenshots to capture  **[user action]**

Run `npm run dev`, then `npm run db:seed:demo:full` once (idempotent) so every
screen has realistic data. Accounts are in `RUNBOOK.md`. Capture on a
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

Admin (`RUNBOOK.md` → super-admin):
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

### 2. Live checks before the defense  **[user action]**

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

### 3. Talking points the questions will hit  **[agent assembles from source docs]**

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

### 4. Document assembly  **[agent]**

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
- [ ] Self-assessment / rubric: `defense.md`.
- [ ] Persian, verb-final, no back-to-back English words in prose — the README
      already sets the register to match.

---

### 5. Optional, not blocking

- Postgres migration (config, not rewrite) — `engineering-decisions.md` §14 has
  the story if a reviewer pushes on it; don't do it before the defense.
- `next/image` for scraped images, PPR on explore, `useOptimistic` on the
  booking modal — `docs/STATUS.md` P5–P10.
- A cron to expire a paid `featured` slot after 30 days (right now a granted
  booking keeps the board "reserved" until an admin cancels it).
- Marketing polish (testimonials, brand bar, Enamad placeholder) —
  `docs/STATUS.md` U5.

---

# یادداشت‌های بازبینی نهایی

## یادداشت‌های بازبینی نهایی — منبع نگارش پایان‌نامه

> **این فایل برای چیست.** خلاصه‌ی کاملِ بازبینی نهاییِ ۱۱ شهریور ۱۴۰۵ (۲۰۲۶-۰۹-۰۲):
> چه چیزهایی خراب بود، چه چیزهایی عوض شد، و **چرا**. هر کسی که مقاله / گزارش فنی /
> پایان‌نامه را می‌نویسد باید از روی این فایل بخواند، نه از روی حافظه.
>
> مکمل‌ها: `docs/engineering-decisions.md` §۱۷–۲۲ (شرح فنیِ مفصلِ همین تصمیم‌ها)،
> `docs/api.md` (مرجع API فعلی)، `docs/architecture.md` (دو مسیر داده).

---

> # 🔴 ⛔ نکته‌ای که حتماً باید در مقاله بیاید — و به خواننده تأکید شود
>
> ## هرگز برای اجرای سایت `npm run dev` نزن. `npm run demo` بزن.
>
> این را **صریح و با تأکید** در متنِ پایان‌نامه/گزارش بنویس، چون هم نویسنده و هم
> خواننده فراموش می‌کنند:
>
> | حالت | CPU برای اولین بازدید از ۱۰ صفحه |
> |---|---|
> | `npm run dev` | **۹.۷ ثانیه** |
> | `npm run demo` = `next build && next start` | **۰.۱ ثانیه** |
>
> ### ۹۷ برابر فشارِ کمتر روی پردازنده.
>
> **چرا:** `next dev` کامپایلرِ Turbopack را زنده نگه می‌دارد و هر مسیر (route) را
> در همان لحظه‌ی اولین کلیک از صفر می‌سازد؛ ضمناً ۶۷۱۰ فایلِ پروژه (که ۴۱۷۳ تای آن
> در `public/` است) را برای hot-reload زیر نظر دارد، React را بدونِ فشرده‌سازی و
> با تمام هشدارهای توسعه می‌فرستد، و کامپوننت‌ها را در strict mode دوبار رندر
> می‌کند. `next build` همه‌ی این کارها را **یک‌بار** انجام می‌دهد و بعد `next start`
> فقط فایلِ آماده را سِرو می‌کند (در حالت بی‌کار: ۰.۱۶ ثانیه CPU در هر ۱۰ ثانیه،
> ۱۲۱ مگابایت رم).
>
> **چرا برای این پروژه مهم است:** دموِ دفاع روی لپ‌تاپِ خودِ دانشجو (مک‌بوک ایرِ
> بدونِ فن) اجرا می‌شود، نه روی سرورِ اجاره‌ای. در حالت `dev`، چرخیدن بین صفحه‌ها
> و پنلِ ادمین لپ‌تاپ را داغ و پر سر و صدا می‌کند — دقیقاً وسطِ جلسه‌ی دفاع.
>
> شرح کامل: `docs/engineering-decisions.md` §۲۲.

---

### ۰. یک جمله برای شروع هر بخش از پایان‌نامه

رسامپ یک **فهرستِ آنلاین** از رسانه‌های تبلیغاتی محیطی ایران است — نه یک سامانه‌ی
رزرو. رسامپ مالکِ رسانه‌ها نیست، پس چیزی را که در اختیار ندارد نمی‌فروشد:
تبلیغ‌دهنده جست‌وجو و مقایسه می‌کند و بعد **مستقیم با صاحب رسانه تماس می‌گیرد**؛
درآمد از سمتِ **آگهی‌دهنده** است (ثبت آگهی، پلن رایگان یا ویژه).

---

### ۱. تغییر مدل کسب‌وکار — مهم‌ترین تصمیم پروژه

#### چه بود
یک جریان کاملِ «رزرو آنلاین»: انتخاب بازه‌ی تاریخ، محاسبه‌ی قیمت با تخفیفِ مدت،
ثبت. پشتش هم مهندسیِ خوبی بود (بررسی هم‌پوشانی در تراکنش، محدودیت یکتا).

#### چرا اشتباه بود
پلتفرم نه رسانه‌ای در اختیار دارد، نه قراردادی امضا می‌کند، نه پولی بابت فضا
می‌گیرد. پس «رزرو»ی که صادر می‌کرد **برای صاحب رسانه الزام‌آور نبود**. جالب اینکه
متنِ خودِ مودال هم همین را اعتراف می‌کرد: «کارشناسان رسامپ برای هماهنگی با صاحب
رسانه با شما تماس می‌گیرند». یعنی عملاً یک فرم استعلام بود که لباسِ صفحه‌ی پرداخت
پوشیده بود.

#### چه شد
کل زیرسیستم رزرو حذف شد (جدول، دو API، مودال، تب داشبورد، پنل ادمین).
مسیر خریدار: جست‌وجو ← مقایسه ← صفحه‌ی جزئیات ← ورود ← دیدن شماره‌ی صاحب رسانه.
مسیر فروشنده (**محصولِ اصلی**): ثبت رسانه ← بررسی ادمین ← انتشار.

#### چه چیزی از دست رفت و کجا جبران شد
مهندسیِ همزمانیِ رزرو قوی‌ترین بخشِ بک‌اند بود. **همان الگو روی مسیر ثبتِ آگهی
منتقل شد**، چون حالا نوشتنِ غیرidempotent آنجاست:

| گاردِ همزمانی | روی رزرو (قدیم) | روی ثبت آگهی (فعلی) |
|---|---|---|
| `Idempotency-Key` | ✅ | ✅ — کلید تکراری همان پاسخ را برمی‌گرداند |
| محدودیت یکتای DB | `@@unique(billboardId,userId,startDate,endDate)` | ایندکس یکتای **جزئی** روی `(submittedById, name, city)` با شرط `source='listing'` |
| تستِ مسابقه | ده درخواست همزمان → یک ردیف | ✅ **همان تست، روی `POST /api/listings`** |
| تصمیمِ یک‌باره | — | تأیید/رد فقط یک‌بار (`409` بارِ دوم) |
| تراکنش | بررسی هم‌پوشانی + درج | ثبت نظر + بازمحاسبه‌ی امتیاز |

> **نکته‌ی فنی قابل دفاع:** ایندکس یکتا **جزئی** است چون رکوردهای اسکرپ‌شده و
> دستیِ ادمین حق دارند نامِ تکراری در یک شهر داشته باشند. Prisma شرطِ `WHERE` روی
> ایندکس را نمی‌تواند بیان کند، پس در فایل migration به‌صورت SQL خام نوشته شده و
> `test/reset-db.mjs` از `prisma migrate deploy` استفاده می‌کند (نه `db push`)،
> وگرنه دیتابیس تست بی‌سروصدا بدونِ آن محدودیت ساخته می‌شد و تستِ مسابقه بی‌معنا
> می‌شد.

---

### ۲. درآمدزایی بدون درگاه پرداخت

دو پلن: **رایگان** و **ویژه** (۴۹۰٬۰۰۰ تومان / ۳۰ روز).

```
ثبت با پلن رایگان  → pending           → تأیید ادمین → available
ثبت با پلن ویژه    → awaiting_payment  → تأیید ادمین (= تأیید واریز) → available + featured
رد شدن             → rejected (هیچ‌وقت عمومی نیست)
```

**چرا درگاه نساختم:** درگاه ایرانی نیاز به کسب‌وکار ثبت‌شده و قرارداد دارد — خارج
از دسترسِ یک پروژه‌ی دانشجویی و مغایر با قاعده‌ی «بدونِ سرویسِ پولی». دو گزینه
داشتم: صفحه‌ی پرداختِ **شبیه‌سازی‌شده** یا یک قدمِ دستیِ صادقانه. صفحه‌ی جعلی دقیقاً
همان ایرادی بود که در همین بازبینی از پنل اسکرپر گرفتم. تأیید دستی یک ماشین
حالتِ واقعی و قابل‌ممیزی است و بعداً فقط یک webhook جایش می‌نشیند — بدون تغییر
اسکیما.

**جداییِ `plan` از `featured`:** `plan` چیزی است که کاربر **خواسته**، `featured`
چیزی است که ادمین **داده**. این جدایی عمدی است: انتخاب پلن ویژه به‌تنهایی
هیچ‌وقت آگهی را بالا نمی‌برد. `featured` اولین کلیدِ مرتب‌سازیِ همه‌ی لیست‌هاست، پس
پروموشن یک اثرِ واقعی دارد نه فقط یک نشان.

---

### ۳. باگ‌های واقعی که پیدا و رفع شدند

#### امنیت

**۱. دفاعِ ضدِ شمارش کاربر عملاً کار نمی‌کرد.**
هر دو مسیر لاگین با یک هشِ «ساختگی» مقایسه می‌کردند که **هشِ bcrypt معتبری نبود**.
bcryptjs بدونِ خطا قبولش می‌کند ولی بلافاصله `false` برمی‌گرداند. اندازه‌گیری:

| حالت | زمان |
|---|---|
| رمز غلط (کاربر موجود) | ~۲۷۲ms |
| کاربر ناموجود | **~۰ms** |

بدنه‌ی هر دو پاسخ ۴۰۱ یکسان بود و **تستِ موجود دقیقاً همین را چک می‌کرد و سبز
بود** — نمونه‌ی کلاسیکِ *اعتماد کاذبِ تست*. با کرنومتر می‌شد فهمید یک شماره ثبت
شده یا نه.
رفع: هشِ واقعیِ cost-12، در یک ثابتِ مشترک تا دو نقطه از هم جدا نیفتند.
**تست جدید نوشتم و با برگرداندنِ عمدیِ باگ راستی‌آزمایی کردم که قرمز می‌شود.**

**۲. آگهیِ تأییدنشده با دانستن slug عمومی بود** — از جستجو، آمار و sitemap پنهان،
ولی API و صفحه‌ی جزئیات سرو می‌کردند. رفع در **لایه‌ی داده** (`getBillboardBySlug`)
نه در تک‌تک روت‌ها.

**۳. آپلود عکسِ ادمین هیچ اعتبارسنجیِ محتوا نداشت** — MIME ادعاییِ مرورگر را باور
می‌کرد.

#### درستی

**۴. هر دو مرتب‌سازیِ کاتالوگ اشتباه بودند.**
«بیشترین بازدید» روی `rating` مرتب می‌کرد و «بزرگترین سطح» فقط روی `width` — یعنی
تابلوی ۱۴×۴ (۵۶ متر مربع) بالاتر از ۸×۱۲ (۹۶ متر مربع) می‌آمد. اینها نتیجه‌ی غلط
بودند، نه تقریب.
مقدارِ درست یکی داخل ستون JSON بود و یکی حاصلِ ضرب — و Prisma هیچ‌کدام را در
`ORDER BY` نمی‌تواند بیان کند. پس دو ستونِ denormal با ایندکس اضافه شد:
`estimatedViews` و `area`. `area` تغییرپذیر است، پس `updateBillboard()` با هر
تغییرِ ابعاد بازمحاسبه‌اش می‌کند.

**۵. آمارِ پوششِ تصویر ۱۰۰٪ گزارش می‌داد.** فیلترِ `images: { not: "[]" }` روی
ستون Json در SQLite هیچ ردیفی را فیلتر نمی‌کند. واقعیت: **۲۰۰۹ از ۳۵۲۸ (۵۷٪)**.

**۶. `hasImages` drift می‌کرد** — کلیدِ اولِ مرتب‌سازیِ پیش‌فرضِ همه‌ی لیست‌ها، ولی
مسیر ویرایش عکس `images` را عوض می‌کرد و آن را نه.

**۷. `seed.ts` آگهی‌های کاربران را پاک می‌کرد** — هر ردیفی که در `lib/data.ts`
نبود حذف می‌شد. با فعال شدن ثبتِ آگهی، اجرای بعدی `db:seed` فاجعه بود.

**۸. جزئی:** تغییر شماره‌ی مشتری در race → ۵۰۰ به‌جای ۴۰۹؛ مسیر `stats` نقش را
چک نمی‌کرد (پروکسی می‌گرفت، ولی defense-in-depth نبود).

#### سه باگی که تست‌های *جدید* پیدا کردند
بعد از پیاده‌سازی، تست‌های تازه سه اشکال در کارِ خودم پیدا کردند:

- **رد کردنِ آگهی وضعیت `inactive` می‌داد** که یک وضعیتِ *عمومی* است («تابلوی
  واقعی که فعلاً کار نمی‌کند»). آگهیِ ردشده قابل دسترسی می‌ماند. → وضعیتِ مستقلِ
  `rejected`.
- **`slugify` کاراکترِ فارسی نگه می‌داشت** ولی روتِ عمومی `^[a-z0-9-]+$` می‌پذیرد
  → هر آگهیِ کاربر منتشر می‌شد ولی از API **۴۰۰** می‌گرفت.
- **sitemap فقط در زمان build ساخته می‌شد** → آگهیِ تأییدشده بعد از deploy هیچ‌وقت
  ایندکس نمی‌شد. (`revalidate = 3600`)

---

### ۴. صداقت محصول — چیزهایی که «کار می‌کردند» ولی جعلی بودند

**پنل اسکرپر کاملاً ساختگی بود.** دکمه‌ی «اجرا» یک آرایه‌ی ثابت از پیام‌های فارسی
را هر ۹۰۰ میلی‌ثانیه پخش می‌کرد و در پایان عددِ hardcodeشده‌ی «۴۵ انجام شد» را
نشان می‌داد. **هیچ درخواستی به سرور نمی‌رفت.** زیرنویسش هم ادعا می‌کرد «این پنل
برای تریگر دستی است» که وضع را بدتر می‌کرد.
→ جایش پنلِ وضعیتِ **فقط‌خواندنیِ** واقعی نشست: شمارشِ زنده‌ی رکوردها به تفکیک
منبع، ایمپورتِ ۷ روز اخیر، رکوردهای بدون مختصات/تصویر — همه از دیتابیس.

**مرحله‌ی آپلود عکس در فرم ثبت رسانه، عکس‌ها را بی‌صدا دور می‌ریخت.** درخواست
اصلاً فیلد عکس نداشت. → حالا واقعاً کار می‌کند و سخت‌سازی شده (بخش ۵).

**`rating`/`reviewCount` ساختگی بودند** و هیچ‌وقت از جدولِ `Review` به‌روز نمی‌شدند.
→ ثبت هر نظر حالا در همان تراکنش بازمحاسبه‌شان می‌کند؛ کارتِ بدون نظر دیگر امتیاز
نشان نمی‌دهد.

---

### ۵. امنیتِ آپلود فایل از کاربر عمومی

هیچ ادعایی از سمت کلاینت باور نمی‌شود:

| ادعای کلاینت | چرا باور نمی‌شود |
|---|---|
| نوعِ اعلام‌شده (`data:image/png`) | با **بایت‌های ابتداییِ خودِ فایل** مقایسه می‌شود (JPEG `FF D8 FF`، PNG `89 50 4E 47…`، WEBP `RIFF…WEBP`)؛ ناهماهنگی = رد |
| پسوند فایل | اصلاً استفاده نمی‌شود — از نوعِ تشخیص‌داده‌شده ساخته می‌شود |
| نامِ فایل | اصلاً استفاده نمی‌شود — سرور می‌سازد (بدونِ traversal، بدونِ بازنویسی) |
| حجم اعلام‌شده | بعد از decode روی بایتِ واقعی سقف می‌خورد (۲MB، حداکثر ۵ فایل) |

**چه کاری نمی‌کند (این را در دفاع بگویید):** آنتی‌ویروس نیست. یک JPEG ساختاراً
معتبر هنوز می‌تواند باگِ یک decoder خاص را هدف بگیرد. چیزی که واقعاً محافظت
می‌کند: فایل‌ها به‌صورت **ایستا و بدونِ اجرا** با `X-Content-Type-Options: nosniff`
سرو می‌شوند، SVG (که اسکریپت‌پذیر است) پذیرفته نمی‌شود، و **آگهی تا وقتی یک انسان
عکس‌ها را ندیده منتشر نمی‌شود**.

`lib/uploads.ts` این را یک‌جا نگه می‌دارد؛ هم مسیر عمومی و هم مدیریتِ تصویرِ ادمین
از آن استفاده می‌کنند، پس دو تا از هم جدا نمی‌افتند.

---

### ۶. ضدِ کپی‌برداری — و مرزِ صداقتش

**اعمال‌شده در `proxy.ts` قبل از هر handler:** مسدودسازیِ UA ربات‌ها روی `/api/*`
**و صفحاتِ کاتالوگ** · سقفِ ۹۰ درخواست/دقیقه per-IP روی `/explore` و `/billboard/*`
· محافظتِ hotlink روی `/images/scraped/*` و `/uploads/*` (Referer خارجی = ۴۰۳؛
نبودِ Referer مجاز است چون مرورگرهای واقعی گاهی نمی‌فرستند) · سقفِ صفحه ۱۰۰ → ۴۸ ·
شماره‌ی تلفن هیچ‌وقت در پاسخ عمومی نیست.

**حذفِ `/api/billboards/pins`:** ~۲۰۰۰ رکورد (نام، slug، مختصات، قیمت) را در یک
درخواستِ cacheable می‌داد — بهترین هدفِ اسکرپ در کل سایت — و **هیچ مصرف‌کننده‌ای
نداشت**: نقشه‌ای که برایش ساخته شده بود دیگر وجود ندارد (صفحه‌ی جزئیات از iframe
گوگل‌مپ استفاده می‌کند). وابستگی‌های `leaflet` هم بلااستفاده بودند و حذف شدند.

> **این را حتماً صادقانه بگویید:** یک وب‌سایت عمومی را نمی‌شود ضدِ اسکرپ کرد. هر
> چیزی که مرورگر رندر کند، مرورگرِ headless با UA عادی و خزشِ آهسته هم می‌کشد.
> کاری که شد حذفِ مسیرهای **ارزان** و بالا بردنِ هزینه است.
> **تنش با SEO:** هر کدام از این اقدامات دیده‌شدن را کم می‌کند. گوگل‌بات عمداً
> استثنا شده و sitemap نگه داشته شده، چون مارکت‌پلیسی که کسی پیدایش نمی‌کند بدتر
> از مارکت‌پلیسی است که آهسته کپی شود.

---

### ۷. سؤالاتی که داور احتمالاً می‌پرسد

| سؤال | پاسخ آماده |
|---|---|
| «چرا رزرو آنلاین ندارید؟» | مالکِ رسانه‌ها نیستیم؛ رزروی که ما صادر کنیم الزام‌آور نیست. مدل: فهرست + تماس مستقیم، درآمد از آگهی‌دهنده. §۱۷ |
| **«این امتیاز ۴.۳ از کجاست؟»** | ⚠️ **مهم‌ترین ریسکِ باقی‌مانده.** داده‌ی نمونه است. سیستمِ نظرِ واقعی کار می‌کند و امتیاز را در تراکنش بازمحاسبه می‌کند؛ کارتِ بدون نظر امتیاز نشان نمی‌دهد. **قبل از اینکه بپرسند خودتان بگویید.** |
| «اعداد ترافیک واقعی‌اند؟» | تخمین heuristic با برچسبِ «تخمین هوشمند» و پانویس. فرمول را توضیح دهید. |
| «پرداخت کجاست؟» | درگاه در دسترس نیست؛ صفحه‌ی جعلی نساختم — ماشین حالتِ واقعی با تأیید دستی. §۱۸ |
| **«خودتان اسکرپ کردید ولی ضدِ اسکرپ گذاشتید؟»** | تناقض را خودتان بپذیرید: «بله، و دقیقاً چون می‌دانم چقدر آسان است، ادعا نمی‌کنم غیرممکنش کردم — هزینه‌اش را بالا بردم.» |
| «سخت‌ترین مسئله‌ی همزمانی چه بود؟» | ثبتِ آگهی: `Idempotency-Key` + ایندکسِ یکتای جزئی + تستِ ده درخواستِ همزمان. تاریخچه هم بگویید: این الگو اول روی رزرو بود و با تغییر مدل به مسیرِ ثبت منتقل شد. |
| «چرا SQLite؟» | خواندن‌محور، نوشتنِ کم و تراکنشی، تک‌ماشین، هزینه‌ی عملیاتی صفر. اولین گلوگاه: قفلِ تک‌نویسنده روی `POST /api/listings`. |
| «چرا هر صفحه API صدا نمی‌زند؟» | `docs/architecture.md` — دو مسیر داده + تشبیه آشپزخانه. **الگوی توصیه‌شده‌ی Next.js است، نه میان‌بر.** |
| «آپلود امن است؟» | بخش ۵ — و صادقانه بگویید آنتی‌ویروس نیست. |

---

### ۸. ضعف‌های باقی‌مانده (خودتان بگویید، نگذارید کشف شود)

- **۳۵۳۲ رکورد امتیازِ ساختگی دارند** (تصمیمِ آگاهانه: داده‌ی موجود دست نخورد).
- **دو ردیف امتیازِ ناهماهنگ** دارند (`5.0/7` ذخیره در برابر `5.0/1` واقعی) —
  بازمانده‌ی نظرهای دموی قدیمی. دستور SQL اصلاح در `defense.md`.
- مدلِ `Owner` را هیچ کدِ برنامه‌ای استفاده نمی‌کند (فقط seed دمو).
- `mapX`/`mapY`/`structureCode` بازمانده‌اند.
- `AuditLog.adminId` همیشه `null` است (ادمینِ env ردیفِ `admins` ندارد؛ هویت در
  `userEmail` و `details.actorId` ثبت می‌شود — در کد مستند است).
- rate limiter و بافرِ ممیزی **درون‌حافظه‌ای** = تک‌نمونه. برای این deploy درست
  است؛ برای چند نمونه Redis لازم است. در کد و مستندات گفته شده.
- تست فقط سطحِ API است — تستِ کامپوننت و E2E مرورگر ندارید.
- `docs/STATUS.md` و `docs/STATUS.md` بخش‌های تاریخیِ مربوط به رزرو را نگه داشته‌اند، با
  بنرِ هشدار در بالا. **مرجعِ وضعیت فعلی این فایل و `docs/api.md` است.**

---

### ۹. اعداد برای نوشتن در گزارش

| مورد | مقدار |
|---|---|
| رکورد بیلبورد | ۳۵۳۶ (۳۵۳۲ منتشرشده) |
| با تصویر | ۲۰۰۹ (۵۷٪) |
| با مختصات | ۳۰۲۰ |
| منابع داده | billboardiha (۲۷۸۱) · aradholding (۶۱۵) · irbillboard (۱۱۵) |
| تست‌ها | **۸۷** (پیش از بازبینی نهایی: ۵۷ · پس از آن: ۷۵) |
| مسیرهای API | ۳۱ فایل روت / ۳۹ متد |
| migrationها | ۱۲ |
| نقش‌ها | `user` < `viewer` < `editor` < `admin` < `super_admin` |

**راستی‌آزماییِ انجام‌شده:** `npm test` (۸۷ تست؛ روی سرورِ production ۸۶ سبز و تنها شکست، تستِ echo کدِ OTP است که عمداً بیرون از production کار می‌کند) · `npx tsc --noEmit` بدون خطا ·
`npm run lint` بدون هشدار · `npm run build` موفق · آزمونِ زنده روی buildِ
پروداکشن (هر هشت آگهیِ دمو دقیقاً وضعیتی که ردیفش می‌گوید را برمی‌گرداند؛ UA ربات
۴۰۳؛ گوگل‌بات ۲۰۰؛ hotlink خارجی ۴۰۳؛ فایلِ جعلیِ PNG رد شد؛ چرخه‌ی ثبت ← تأیید ←
انتشار + `featured`؛ تأییدِ دوباره ۴۰۹).

---

# خودارزیابی

## Internal self-assessment

> A candid rubric score, written for the thesis document's evaluation chapter.
> Not marketing — the weak spots are listed on purpose so the defense isn't
> ambushed by them. Scale: A (excellent for a capstone) → C (acceptable) → D
> (a real gap).

Overall: **A−**

| Axis | Grade | Evidence | Honest caveat |
|------|-------|----------|---------------|
| **Requirements coverage** | A− | Search, filter, compare, detail, reviews, gated contact reveal, a self-service listing pipeline (submit with photos → admin review → publish, with a paid tier), user auth + phone OTP reset, a full admin panel (billboards CRUD, approval queue, quality, data status, users, audit), an in-app API reference. | The scraper/geocoding pipeline is deferred (documented) — the dataset is seeded, not live-refreshed. Payment is a manual admin confirmation, not a gateway (deliberate — §18). |
| **Architecture** | A | One data layer (`lib/db/`), the framework's two entry paths used correctly (RSC reads the DB, client code calls the API), a fixed request pipeline on every route, `proxy.ts` as the single auth boundary. `docs/architecture.md` + `docs/engineering-decisions.md` §1–2. | The public-facing bundle once shipped the whole 4 MB dataset — a real bug, found and fixed (`lib/types.ts` split, 7.7 → 1.0 MB). Good that it was caught; notable that it happened. |
| **Database design** | A− | Normalised schema, explicit PKs, composite indexes on the real query shapes `(city,status)` / `(city,type)` / `(type,price)`, WAL mode + `synchronous=NORMAL`, JSON columns only where SQLite has no array type. Prisma migrations, hand-written where the AI guard blocks `migrate dev`. | SQLite, not a client/server RDBMS. Defensible (see §14) and the path to Postgres is a connection string, but a reviewer may still want more. Arrays-as-JSON is a modelling compromise. |
| **Concurrency & correctness** | A− | Idempotency-Key on the listing POST (a replayed key returns the stored response, never a second row); the approval decision is single-shot (409 on a second attempt), so a paid promotion cannot be granted twice; the review write and the rating recomputation share one `$transaction`. | Rate limiting is in-memory (single instance) — correct for the deployment, would need Redis for multi-instance; stated in the code and docs. The date-overlap race guard was the strongest piece here and went away with the booking flow (§17). |
| **Security** | A | Endpoint-not-UI boundary, RBAC `viewer<editor<admin<super_admin`, JWT HS256 in an HttpOnly SameSite=Strict cookie, bcrypt cost 12 + timing-safe login, Zod `.safeParse()` on every input with sort/filter allowlists, non-spoofable client IP, per-IP + per-user rate limits with humane lockouts, a durable audit log for every admin mutation, fail-closed env validation at boot, generic auth errors (no user enumeration), owner phone numbers behind auth. `npm audit` reviewed, `next` CVEs patched. | No WAF / CAPTCHA / hosted error tracking — out of scope for a self-hostable, no-paid-service project, and the reasoning is documented (§7a). |
| **Error handling & UX** | A− | Styled Persian 400/403/404/500 pages + a client error boundary, a short reference id on every unexpected 500 (shown to the user, logged with the stack), designed empty/loading/failure states, disabled in-flight buttons, a "try again in N minutes" message on rate-limit. | A few flows still surface a raw server 409 as the first signal (the booking clash guard now pre-empts the main one). |
| **Observability** | A− | One JSON object per log line, one `api_request` per request, `withApiLog` on every route, audit lines routed through the same logger, optional rotated file via `LOG_DIR`. §7 + §7a explain the deliberate stop point and the path forward. | No dashboards/alerting — that's the deployment layer, and the format is built for it, but it isn't wired. |
| **Testing** | A− | 71 dependency-free API tests (`node:test` + `fetch` against a real dev server on an isolated DB): validation, allowlists, rate limits, no enumeration **by body or by timing**, upload magic-byte rejection, the approval state machine, object-level authz, the OTP reset flow, sort correctness (each guarded against a vacuous pass). `npm run bench` for load. | API-level only — no component/unit tests, no E2E browser suite. Reasonable for the scope and timeline; worth naming as future work. |
| **Code quality** | A− | Consistent structure across ~28 routes, single-responsibility modules, `0` lint warnings, no `TODO`/`FIXME`/`@ts-ignore` in the codebase, TypeScript strict. Inline-style rule inflates line counts but that's a deliberate design-system choice. | `page.tsx` files are large (600+ lines) because of inline styles; the admin billboards list was loading all rows and filtering in JS until this pass (now DB-side); one O(n²) stat was replaced with O(n). |
| **Documentation** | A | `docs/` carries architecture, ~28-endpoint API reference, 16 decision records with a milestone log, a security audit, a production-readiness triage, demo-account sheet, and this prep checklist. README is a readable narrative, not a command dump. | — |

### Where a stricter grader would push

1. **SQLite** — have §14 and the "config not rewrite" argument ready.
2. **In-memory rate limiter** — single-instance only; the Redis path is noted.
3. **No browser/E2E tests** — API coverage is strong, UI coverage is manual.
4. **Scraper deferred** — the live data pipeline exists in `scraper/` but isn't
   part of the running system; the dataset is a seed.
5. **The bundle-leak bug** — own it: it was found by measuring, not by luck, and
   fixed structurally.
