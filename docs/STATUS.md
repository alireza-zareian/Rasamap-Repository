# وضعیت پروژه و آمادگی پروداکشن

> پیش‌تر این محتوا در پنج فایل جدا بود: `docs/STATUS.md`، `docs/STATUS.md`، `STATUS.md`،
> `STATUS.md` و `STATUS.md`. همه یک پرسش را جواب می‌دادند —
> «پروژه کجای کار است و چه چیزی مانده» — و اکنون در همین یک فایل‌اند.


---

# وضعیت جاری و کارهای باقی‌مانده

## Rasamap — وضعیت پروژه

> این فایل جایگزین خواندن `roadmap.html` برای Claude است.
> هر session جدید: این فایل را بخوان → وضعیت کامل را بفهم → شروع کن.

> ## ⛔ 🔴 قانونِ همیشگی: برای دیدن/ارائه‌ی سایت `npm run demo` — نه `npm run dev`
>
> اندازه‌گیریِ واقعی روی همین پروژه (اولین بازدید از ۱۰ صفحه):
> **`dev` = ۹.۷ ثانیه CPU · `demo` (build+start) = ۰.۱ ثانیه CPU → ۹۷ برابر کمتر.**
>
> دلیل: `dev` هر صفحه را لحظه‌ی کلیک از صفر کامپایل می‌کند + ۶۷۱۰ فایل را watch
> می‌کند. روی مک‌بوک ایرِ بدون فن همین باعثِ داغ‌شدنِ لپ‌تاپ می‌شود.
> `dev` فقط برای کدنویسی با hot-reload.
>
> **📝 به ایجنتی که مقاله/پایان‌نامه را می‌نویسد:** این را در متن بیاور و به
> خواننده تأکید کن. عدد ۹۷ برابر قابل‌استناد است و در `docs/engineering-decisions.md`
> §۲۲ مستند شده.

> ⚠️ **۱۱ شهریور ۱۴۰۵ — مدل محصول عوض شد.** در بازبینی نهایی، کل زیرسیستم رزرو
> حذف شد: رسامپ مالک رسانه‌ها نیست، پس چیزی را که در اختیار ندارد نمی‌فروشد.
> خریدار شماره‌ی صاحب رسانه را می‌گیرد و مستقیم توافق می‌کند؛ درآمد از ثبتِ آگهی
> است (دو پلن + تأیید دستی پرداخت). بخش‌های زیر که از «رزرو» حرف می‌زنند **سابقه‌ی
> تاریخی**‌اند، نه وضعیت فعلی. وضعیت فعلی: `docs/api.md` و
> `docs/engineering-decisions.md` §۱۷–۲۱.


---

### اطلاعات پایه

- **پروژه:** فهرست آنلاین رسانه‌های تبلیغاتی محیطی (بیلبورد) با ثبتِ آگهیِ پولی — thesis دانشگاهی
- **Stack:** Next.js 16.2.11 App Router · React 19 · TypeScript 5 strict · SQLite + Prisma 7 · JWT HttpOnly · Inline CSS (بدون Tailwind class در JSX)
- **DB:** 3532 بیلبورد · 2009 با تصویر (۵۷٪) · 3020 geocoded
- **ارزیابی کد:** A− برای thesis — security غیرمعمول قوی

---

### قوانین غیرقابل نقض (هرگز نقض نکن)

1. Zod `.safeParse()` — هرگز `.parse()` یا `JSON.parse(userInput)`
2. Admin route order: `session → rate limit → Zod → business logic`
3. DB reads: همیشه از `lib/db/billboards.ts` — هرگز از `lib/data.ts`
4. همه رشته‌های user-visible به فارسی
5. Styling: فقط `style={{}}` inline — هیچ Tailwind class در JSX
6. بعد از هر تسک: این فایل را آپدیت کن (تیک بزن)
7. Proxy (نه middleware): فایل `proxy.ts` در root

---

### تصمیم‌های ثابت (دست نزن)

- Scraper/geocoding: deferred — بعد از ارائه
- SQLite: کافی است — تغییر DB ممنوع
- Guest checkout نه — reservation نیاز به login دارد
- Types و `typeLabels` از `lib/types.ts` (بدون دیتا). `lib/data.ts` فقط دیتاست استاتیک/scraped + JSON ۴MB است و **فقط** `prisma/seed.ts` آن را import می‌کند — import آن از کد کلاینت/صفحه کل دیتاست را وارد باندل مرورگر می‌کند

---

### وضعیت فازها

#### ✅ فازهای اصلی — کامل

- [x] **Phase 3** — DB Schema + Migration (Prisma, seed, 3545 رکورد)
- [x] **Phase 4** — Public API + Explore/Landing از DB می‌خوانند
- [x] **Phase 5** — ⏸ Scraper Pipeline (deferred — در loop geocoding افتاد)
- [x] **Phase 6** — Admin CRUD: PUT/DELETE بیلبورد از DB
- [x] **Phase 7a** — User Auth: register/login/logout/me + proxy guard
- [x] **Phase 7b** — Reservation API: POST + overlap check + dashboard واقعی
- [x] **Phase 8** — QA: error.tsx, not-found.tsx, pagination Explore, admin component split
- [x] **Phase 9** — Demo Prep: demo.html, seed-demo.ts, پاسخ سؤالات داور

#### ✅ بهبودهای معماری — کامل

- [x] **A1** — Server-side filtering/pagination (نه کل 3545 رکورد به client)
- [x] **A2** — list-media: POST /api/listings واقعی (status "pending")
- [x] **A3** — ImageManager: PUT /api/admin/billboards/[id]/images واقعی
- [x] **A4** — BookingModal: فیلدهای اضافی حذف، اطلاعات از JWT session
- [x] **A5** — Admin reservation management panel
- [x] **A6** — SEO: sitemap.xml (3545 billboard + 4 صفحه اصلی)

#### ✅ بهبودهای پرفورمنس — کامل (۲۰۲۶ standards)

- [x] **P1** — WAL mode + synchronous=NORMAL + foreign_keys=ON روی SQLite connection (`lib/db/client.ts`)
  - concurrent reads بدون SQLITE_BUSY — ضروری برای ارائه با چند داور همزمان
- [x] **P2** — Composite indexes: `(city,status)`, `(city,type)`, `(type,price)` در `prisma/schema.prisma`
  - ⚠️ نیاز به اجرا: `npx prisma db push`
- [x] **P3** — Font preload: `<link rel="preload" as="style">` برای Vazirmatn در `app/layout.tsx`
  - مرورگر font CSS را زودتر fetch می‌کند → LCP بهتر
- [x] **P4** — Cache-Control از `max-age=30/120` به `max-age=60/300` در `/api/billboards`

##### 📋 پس از ارائه — مستند، پیاده نشده

- [ ] **P5** — `next/image` برای scraped images (نیاز به `remotePatterns` در next.config + full test)
- [ ] **P6** — Server Components refactor برای `billboard/[slug]/page.tsx` (static parts → RSC)
- [ ] **P7** — PPR (Partial Prerendering) روی explore page — `experimental_ppr = true`
- [ ] **P8** — Server Actions + `useOptimistic` برای BookingModal
- [ ] **P9** — Bundle analyzer: `npx @next/bundle-analyzer` — شناسایی chunk های بزرگ
- [ ] **P10** — JSON-LD structured data روی billboard detail pages (SEO)

---

#### ✅ بهبودهای امنیتی — کامل

- [x] **S1** — Rate limiting sliding window (login + API)
- [x] **S2** — Zod validation همه ورودی‌ها + allowlist sort/filter
- [x] **S3** — bcrypt cost 12 + timing-safe dummy hash
- [x] **S4** — RBAC: super_admin > admin > editor > viewer

#### ✅ بهبودهای کیفیت — کامل

- [x] **Q1** — admin/page.tsx تقسیم به components/admin/
- [x] **Q2** — error.tsx + not-found.tsx فارسی
- [x] **Q3** — lib/db/client.ts با explicit driver adapter

#### ✅ فیچرهای اضافه — کامل

- [x] **F1** — Analytics page (/analytics)
- [x] **F2** — Compare: localStorage sync + CompareModal (حداکثر 2 آیتم)
- [x] **F3** — Billboard detail: BillboardGallery + ShareButton + Breadcrumb
- [x] **F4** — TrafficMeter component در detail page
- [x] **F5** — Reviews: جدول Review در Prisma + GET/POST /api/reviews + ReviewsSection
- [x] **F6** — /list-media gate به login (proxy.ts)

#### ✅ UI/UX فازهای اول — کامل

- [x] **UX0** — Visual Audit: پالت قدیمی (نارنجی) جایگزین با آبی (#3B7BF5) + warm amber
- [x] **U1** — Landing: hero parallax + gallery sliding + CTA + footer + stats از DB
- [x] **U2** — Explore: server-side filter + map pins (3032 geocoded) + Topbar + URL params
- [x] **U3** — Billboard detail: gallery lightbox + ShareButton + breadcrumb + TrafficMeter
- [x] **U4** — Polish: BillboardCard یکپارچه + ticker زنده + about/contact/terms + footer سراسری + hero compact یک‌خطی
- [x] **U4b** — BackgroundPattern: خطوط vine از صفر شروع می‌کنند و با اسکرول با ease-in-out و cascade تدریجی رشد می‌کنند (vine1 از scroll=0, vine2 از scroll=5%, vine3 از scroll=12%)

---

### 🚀 فازهای بعدی — باید انجام شوند

#### U5 — تصویر انسانی و اعتمادسازی
> **اولویت: اول** | مطالعات: +45-105% conversion با تصویر انسانی واقعی

- [ ] لندینگ: section «مشتریان می‌گویند» — 3 testimonial card با آواتار رنگی (حرف اول)، نام فارسی، شرکت، نقل‌قول خاص
- [ ] لندینگ: نوار برند «همراه برندهایی مثل...» — 4-5 لوگوی تایپوگرافی ساده فارسی
- [ ] لندینگ stats bar: حذف/جایگزینی آمار `۱۲M+ بازدید` hardcoded — با آمار واقعی DB یا حذف آن
- [ ] About page: بازنویسی کامل — داستان، ارزش‌ها، «چرا رسامپ؟» با 3 ستون مزیت
- [ ] Footer: placeholder بصری برای Enamad badge

**فایل‌ها:** `app/page.tsx`, `app/about/page.tsx`

---

#### U6 — کاهش حس AI / میکرو-انیمیشن
> **اولویت: دوم** | Anti-AI design trend 2025-2026

- [ ] `globals.css`: shimmer animation — جایگزینی همه emoji fallback (🏙️) با shimmer rect animated
- [ ] `components/BillboardCard.tsx`: hover → image `scale(1.03)` 0.4s ease
- [ ] لندینگ: «آنلاین رزرو کن» با `var(--accent-warm)` به جای آبی در headline
- [ ] `globals.css`: subtle noise texture overlay روی body (4% opacity SVG filter)
- [ ] Typography: متن‌های توضیحی با `fontWeight: 300` برای contrast بهتر

**فایل‌ها:** `app/globals.css`, `components/BillboardCard.tsx`, `app/page.tsx`

---

#### U7 — رفع باگ‌های UX-Breaking
> **اولویت: فوری** — این‌ها سایت را خراب می‌کنند

- [ ] **login shadow:** `rgba(255,77,0,0.4)` → `rgba(59,123,245,0.4)` در `app/login/page.tsx`
- [ ] **contact فرم تقلبی:** حذف disclaimer + فرم + جایگزینی با info cards صادقانه + لینک مستقیم mailto: و Telegram
- [ ] **contact icons:** جایگزینی emoji (✉️📱🏢⏰) با Lucide (Mail, Phone, Building2, Clock)
- [ ] **list-media step 4:** اضافه کردن `<input type="file" hidden>` با `onChange` handler واقعی
- [ ] **list-media validation:** بررسی required fields قبل از هر «بعدی»
- [ ] **compare thumbnails:** اضافه کردن عکس 64px به کارت‌های compare page

**فایل‌ها:** `app/login/page.tsx`, `app/contact/page.tsx`, `app/list-media/page.tsx`, `app/compare/page.tsx`

---

#### U8 — پالیش داشبورد و پروفایل
> **اولویت: سوم**

- [ ] `components/UserAvatar.tsx` (جدید): دایره رنگی با حرف اول نام
- [ ] داشبورد: اضافه کردن UserAvatar در sidebar و greeting
- [ ] داشبورد: تغییر آیکون confirmed count از `Calendar` به `CheckCircle2` (الان دو Calendar داریم)
- [ ] داشبورد ردیف رزرو: thumbnail 64px بیلبورد + نام کلیک‌پذیر به `/billboard/slug`
- [ ] داشبورد empty state رزروها: زیباتر با icon بزرگ‌تر و متن راهنما

**فایل‌ها:** `app/dashboard/page.tsx`, `components/UserAvatar.tsx`

---

#### U9 — ریسپانسیو / موبایل
> **اولویت: چهارم** | 78% کاربران ایرانی از موبایل

- [ ] Footer لندینگ: collapse → single column زیر 640px
- [ ] Dashboard sidebar: hamburger toggle زیر 768px
- [ ] لندینگ header: زیر 420px فقط لوگو + explore
- [ ] explore filters: bottom-sheet برای موبایل (از backlog U2)
- [ ] about stats: single column زیر 640px
- [ ] billboard gallery در detail: swipe gesture support

**فایل‌ها:** `app/page.tsx`, `app/dashboard/page.tsx`, `app/about/page.tsx`, `app/globals.css`, `app/explore/page.tsx`

---

#### U10 — Map-First Explore (بلندمدت)
> **اولویت: بعد از MAP issues** | بزرگ‌ترین فرصت رقابتی — مثل AdQuick/Blip

- [ ] Map view به عنوان default در explore
- [ ] Price pins روی نقشه (مثل Zillow)
- [ ] «جستجو با حرکت نقشه» toggle (مثل Airbnb)
- [ ] در موبایل: list-first با sticky «نمایش نقشه»
- [ ] Card hover ↔ pin highlight sync (از backlog U2)
- [ ] Filter pills horizontal scroll بالای صفحه

**وابسته به:** حل MAP-A, MAP-B, MAP-C اول

---

### ⏸ مشکلات نقشه — تحقیق معوق

> قبل از هر تغییر، تحقیق ریشه‌ای لازم است — تعویض مکرر provider ممنوع

- [ ] **MAP-A** — شناسایی منشأ پیام «API Key Required» (console log، network tab)
- [ ] **MAP-B** — مختصات بیلبوردها نادرست — ردیابی pipeline: scraper → DB → geocoding → Leaflet
- [ ] **MAP-C** — لینک Google Maps در detail page — بررسی URL generation (lat/lng vs text query)
- [ ] **MAP-D** — مقایسه provider‌ها برای ایران: CARTO (فعلی) vs Neshan vs OSM Nominatim

**فایل‌های مرتبط:** `app/explore/map/page.tsx` (فعلاً فقط redirect به `/explore`)، `NESHAN_API_KEY` در env. کامپوننت `RealMap.tsx`/`MapView.tsx` در پاکسازی حذف شد — در تاریخچه‌ی git است اگر کار نقشه از سر گرفته شود.

---

### یافته‌های تحقیق رقبا (خلاصه)

#### جهانی
- **AdQuick**: map-first، قیمت شفاف، booking فوری — «آمازون برای بیلبورد» — OOH Platform of Year 2025
- **Blindspot**: قیمت‌گذاری ساعتی، AI planner «Blinky»
- **Blip**: pure self-serve، $20/day بدون قرارداد

#### ایرانی
- **Bineshmedia**: ادعای اول بودن در ایران، Enamad، فرم رزرو
- **Adnel**: کارت با عکس واقعی، Enamad، دسته‌بندی داخلی/خارجی
- **Billboardiha**: فیلتر استان/شهر، بخش مزایده

**فاصله رقابتی:** هیچ پلتفرم ایرانی ندارد: map browse واقعی + قیمت شفاف + رزرو فوری

#### داده‌های روانشناسی
- تصویر انسانی واقعی: +45-105% conversion (مطالعات HubSpot، 37Signals، VWO)
- مغز تصاویر را 60,000× سریع‌تر از متن پردازش می‌کند
- Stock photo عمومی (کت‌وشلوار در اتاق جلسه): اعتماد را خراب می‌کند — نه عکس بهتر از stock بد

---

### فایل‌های کلیدی

```
app/
  page.tsx                    لندینگ
  explore/page.tsx            جستجو + فیلتر
  explore/map/page.tsx        نقشه
  billboard/[slug]/page.tsx   جزئیات بیلبورد
  compare/page.tsx            مقایسه
  dashboard/page.tsx          داشبورد کاربر
  admin/page.tsx              پنل ادمین
  login/page.tsx              ورود/ثبت‌نام
  about/page.tsx              درباره ما
  contact/page.tsx            تماس
  list-media/page.tsx         ثبت رسانه (wizard 5-step)
  api/
    billboards/route.ts       GET (فیلتر + pagination)
    listings/route.ts         POST ثبت آگهی (با آپلود عکس) + GET آگهی‌های کاربر جاری
    admin/listings/route.ts   GET صف تأیید
    admin/listings/[id]/decision/route.ts  POST تأیید/رد
    reviews/route.ts          GET + POST نظرات
    listings/route.ts         POST ثبت رسانه (pending)
    stats/route.ts            GET آمار کلی
    auth/*/route.ts           register/login/logout/me
    admin/billboards/*/       PUT + DELETE + images

lib/
  db/billboards.ts            getAllBillboards, getFilteredBillboards, ...
  db/client.ts                Prisma singleton با driver adapter
  data.ts                     ⚠️ دست نزن — فقط type definitions
  auth/useCurrentUser.ts      hook کاربر جاری
  theme.ts                    dark/light toggle

components/
  BillboardCard.tsx
  BookingModal.tsx
  CompareBar.tsx
  CompareModal.tsx
  BillboardGallery.tsx
  ShareButton.tsx
  TrafficMeter.tsx
  ReviewsSection.tsx
  Footer.tsx
  admin/                      EditModal, ImageManager, BillboardRow, ...

proxy.ts                      Next.js 16 Proxy (نه middleware!)
prisma/schema.prisma
```

---

### دستورات

```bash
npm run dev              # localhost:3000
npm run build            # باید بدون خطا پاس شود
npm run lint
npm test                 # سوییت API (node:test) — ۵۷ تست
npm run bench            # بنچمارک بار (سرور dev باید بالا باشد)
npm run db:migrate
npm run db:seed          # 3545 رکورد
npm run db:seed:demo:full # حساب‌های دموی کامل (RUNBOOK.md) — idempotent
npm run db:backup        # بکاپ آنلاین SQLite → backups/
npm run db:studio        # Prisma Studio
```

**Env لازم:** `DATABASE_URL` · `AUTH_SECRET` · `ADMIN_EMAIL` · `ADMIN_PASSWORD_HASH` · `ADMIN_NAME` · `NESHAN_API_KEY`
**Env اختیاری:** `LOG_DIR` / `LOG_LEVEL` (لاگ به فایل) · `KAVENEGAR_API_KEY` + `KAVENEGAR_SENDER` / `KAVENEGAR_OTP_TEMPLATE` (SMS — تا وقتی خالی باشد کل لایه SMS خاموش است) · `OTP_DEV_ECHO` (فقط لوکال)

---

### کارهای دور دوم (شهریور ۱۴۰۵) — کامل

- **امنیت پایه:** `next` 16.2.11 (۱۰ CVE)، env fail-closed، client-IP غیرقابل جعل، Idempotency-Key + یکتایی بازه رزرو + تست همزمانی.
- **حریم خصوصی:** شماره مالک از همه پاسخ‌های عمومی و RSC حذف شد؛ `GET /api/billboards/[slug]/contact` فقط برای کاربر واردشده؛ دکمه رزرو اول login می‌خواهد.
- **آیکون‌ها:** جاروی کل سایت — ایموجی کیبوردی → Lucide (پنل ادمین + همه صفحات کاربر).
- **موبایل:** فونت self-host، خنثی‌سازی dark-mode مرورگر، رفع سرریزهای topbar / explore / جزئیات / پنل ادمین / نوار مقایسه.
- **پنل ادمین:** مدیریت چند-ادمین (`/api/admin/users`)، فهرست کاربران ثبت‌نام‌شده (`/api/admin/customers`)، کلیک روی کاربر → مشاهده/ویرایش/بازنشانی رمز، کلیک روی بیلبورد در پنل رزرو → مدیریت کامل، بخش کیفیت با توضیح + دکمه اصلاح، lightbox تصاویر.
- **Rate limit:** قفل ۲ دقیقه‌ای برای `userApi` (نه ۱۵ دقیقه)، پاسخ ۴۲۹ با `Retry-After` + پیام فارسی «N دقیقه دیگر»، یک ردیف durable `rate_limit_hit` به‌ازای هر قفل، سقف ۵۰هزار کلید در حافظه.
- **منطق On-Time:** تأیید رزرو → وضعیت بیلبورد `reserved` (تراکنش)؛ لغو → آزاد. BookingModal بازه‌های رزروشده را نشان می‌دهد و انتخاب متداخل را همان‌جا می‌بندد.
- **لاگ:** `auditLog` از `logger` رد می‌شود؛ `LOG_DIR` → `app.log` چرخشی. `engineering-decisions §7a` = چرا هنوز Docker/ELK/Sentry نداریم + مسیر افزودنش.
- **SMS (خاموش):** `engineering-decisions §16` — آداپتر کاوه‌نگار + `otp_codes` + `/api/auth/otp/{send,verify}` + صفحه `/reset-password` + پیامک خوش‌آمد. تا `KAVENEGAR_API_KEY` خالی باشد بی‌اثر.
- **کارایی:** فهرست بیلبورد ادمین حالا در DB فیلتر/مرتب/صفحه‌بندی می‌شود (نه بارگذاری ۳۵۴۵ ردیف). آمار «خوشه هم‌مکان» از O(n²) به O(n). lint تمیز (۰ هشدار).

#### قبل از ارائه — چک‌لیست کامل در `defense.md`

انجام‌شده:
- ✅ `npm run db:dedupe -- --apply` → ۱۷ رکورد تکراری واقعی حذف شد (۳۵۴۹ → ۳۵۳۲). بکاپ در `backups/dev-*-pre-dedupe.db`.
- ✅ `LOG_DIR="./logs"` به `.env` اضافه شد — از این به بعد `logs/app.log` چرخشی هم نوشته می‌شود.
- ✅ ارزیابی داخلی: `defense.md` (نمره‌ی A−، با نقاط ضعف صادقانه).

مانده برای روز ساخت داکیومنت (نیاز به حضور تو):
- اسکرین‌شات‌ها — لیست دقیق صفحات و حالت‌ها در `defense.md` §۱.
- تست مرورگری روی گوشی — `defense.md` §۲.
- مونتاژ فصل «چه ساختیم و چرا» از `docs/engineering-decisions.md` — `defense.md` §۴.

---

### بعد از هر تسک

1. تیک بزن در این فایل ([ ] → [x])
2. `npm run build` را اجرا کن — باید پاس شود
3. `docs/roadmap.html` را فقط برای ارائه نهایی آپدیت می‌کنیم

---

# تریاژ آمادگی پروداکشن (PLAN)

## PLAN — Production Readiness Triage

> ## 🔴 ⛔ Non-negotiable: view and demo the site with `npm run demo`, not `npm run dev`
>
> Measured on this project — first visit to ten routes: **`dev` 9.7 s CPU vs
> `start` 0.1 s CPU (~97×)**. The demo runs on the author's fanless MacBook Air;
> `dev` mode is what makes it hot mid-defense. `npm run demo` = `next build &&
> next start`. Keep `dev` for code-writing only.
> Rationale and the image-weight half: `docs/engineering-decisions.md` §22 / §22a.
>
> **Any agent producing a report or thesis text from this repo must repeat this
> rule to the reader, with the number.**

> Generated from `PRODUCTION_STATUS.md`. Scope filter: bachelor capstone, ~5 days to
> demo, solo dev, Iran (no paid SaaS), local/private-server demo. Priority beats
> completeness.
>
> ⚠️ **2026-09-02 — the product model changed.** The final review removed the whole
> reservation subsystem: Rasamap does not own the media it lists, so it cannot sell
> inventory it does not control. Buyers now get the owner's phone number; revenue
> comes from the listing side (two plans + a manual payment confirmation). Sections
> below that discuss reservations are **historical record**, not current state.
> Current state: `docs/api.md` and `docs/engineering-decisions.md` §17–21.

### (a) What this project actually is

Rasamap is an Iranian outdoor-media (billboard) marketplace. Persian RTL UI. A visitor
browses/filters ~3,500 billboard listings, opens a detail page, and — after registering
with an Iranian mobile number — sees the owner's phone number and deals with them
directly. Media owners submit their own listings (with photos) on a free or paid plan;
admins review, approve and publish them through a separate RBAC-gated panel.

- **Stack:** Next.js 16.2.11 App Router, React 19, TS strict, SQLite + Prisma 7
  (`better-sqlite3`, WAL), JWT HttpOnly cookies (jose), Leaflet, inline-CSS.
- **Scale:** read-heavy, single SQLite file, single instance, a few concurrent users at
  the demo. Data comes from a Python scraper → `seed.ts` → `dev.db`.
- **User model:** anonymous visitor · registered `user` (reserve) · admin roles
  `viewer < editor < admin < super_admin` (env-var single admin today).
- **Auth:** `proxy.ts` guards `/admin/*`, `/api/admin/*`, `/dashboard/*`,
  `/api/reservations`, `/api/listings`. bcrypt cost 12, timing-safe dummy hash, sliding
  window rate limiting, in-memory audit ring buffer.

### (b) Remaining from STATUS.md / roadmap (practical, unfinished)

- U5–U9 UI polish (testimonials, anti-AI microanimation, dashboard avatars, mobile
  responsive passes) — product polish, not covered here.
- U7 UX-breaking bugs: fake contact form still posts nowhere; `list-media` step 4 file
  input is non-functional; `list-media` has no per-step required-field validation;
  compare page has no thumbnails; stale orange shadow on login.
- MAP-A..D: map "API Key Required" message, wrong billboard coordinates, Google Maps
  link format — research deferred by decision.
- P5–P10 performance backlog (next/image, RSC refactor, PPR, bundle analyzer, JSON-LD) —
  documented, post-demo.
- STATUS.md P1: `AnalyticsTab` — check whether it now reads `/api/analytics` (route
  exists) or still `lib/data.ts`.

### (c) Found during audit (missing / wrong)

| # | Finding | Severity |
|---|---------|----------|
| F1 | **Repo is not a git repository** (`.git` absent) — Phases 11/12 blocked, no history, no rollback. | High |
| F2 | No `.env.example` in repo. → **fixed** | Med |
| F3 | `dev.db` (12 MB + WAL) not in `.gitignore`; would be committed on `git init`, may hold real user data. → **fixed** | High |
| F4 | `project-ai.zip` (265 KB) tracked at repo root; `.DS_Store` scattered. → gitignore updated; zip deletion needs user OK | Low |
| F5 | No `RUNBOOK.md` / `RUNBOOK.md`. → **fixed** | Med |
| F6 | No `LICENSE`. | Low |
| F7 | No automated tests at all — nothing to run in CI or pre-deploy. | Med (accepted) |
| F8 | Docs disagree on row count (2,808 vs 3,545) and on whether `lib/data.ts` is types-only or imports `billboards.json`. Reviewer-confusing. | Low |
| F9 | Reservation overlap check is inside `$transaction`. Test T1.5 fires two identical concurrent POSTs → exactly one 201, one 409, so the guard holds on this single-process + single-writer-SQLite setup. Still no DB-level exclusion constraint, so it would need revisiting on a multi-instance / different DB. | Low — verified OK for now |
| F10 | Rate limiter + audit log are in-memory → reset on restart, not multi-instance. Acceptable for single-instance demo; state it out loud. | Low (accepted) |
| F11 | CSP allows `script-src 'unsafe-inline' 'unsafe-eval'` (Leaflet). Documented tradeoff. | Low (accepted) |
| F12 | No structured logging / rotating log file — only `console.error` guarded by `NODE_ENV`. Professors often ask. | Med |
| F13 | No DB backup script or documented restore. | Med |
| F14 | Object-level authz on `/api/reservations/my` and admin routes: verify a user cannot read another user's reservation by ID. | Med — needs check |
| F15 | **`lib/data.ts` mixed pure types + `typeLabels` + a 4 MB `billboards.json` import in one module.** Every page rendering a billboard card imported `typeLabels`, so the bundler pulled the whole module → a **6.7 MB client chunk** of scraped billboard JSON shipped to every visitor (verified in `.next/static/chunks`). Fixed: split into `lib/types.ts` (data-free). Client chunks 7.7 MB → 1.0 MB. | High → **fixed 2026-09-01** |

### (d) Priority ranking

#### Tier 1 — blocks demo / embarrasses in front of professors (do first)
- [x] T1.1 `.env.example` (names only) — 5 min
- [x] T1.2 `.gitignore`: ignore `*.db*`, zips, logs; keep `.env.example` — 5 min
- [x] T1.3 `git init` + first clean commit on `main` + pushed to GitHub (private,
      SSH auth) — 155 files / ~6 MB, no secrets. `public/images/scraped/` (712 MB) and
      raw scraper dumps excluded via `.gitignore`. `LICENSE` (MIT) added. (F1, F3, F4)
- [x] T1.4 `npm run build` OK, `tsc --noEmit` clean, `npm test` 24/24. `npm run lint`
      still reports 36 pre-existing errors (react-hooks etc.) — same as before this work,
      zero added. Tracked as separate lint-debt item for the next round.
- [x] T1.5 Automated instead of manual: `npm test` — dependency-free `node:test` suite
      (`test/`) hits a real `next dev` server on an isolated `prisma/test.db`. 19 tests,
      all passing. Covers validation, sort/param allowlists, per-IP login rate limit,
      no user enumeration, reservation race guard (concurrent double-submit → exactly
      one row), and object-level authz. Also added `npm run bench` (dependency-free
      load benchmark). (Phase 10.1 / 7.4 / 7.5 / 8.3 / 16)
- [x] T1.6 U7 audit: login shadow, fake contact form (now honest info cards + Lucide
      icons + mailto/Telegram), list-media file input, and compare thumbnails were
      **already fixed** in earlier work — STATUS.md's list was stale. Remaining real
      gap fixed now: per-step required-field validation in `/list-media` (`validateStep`
      blocks «بعدی» until the step's fields are valid).

#### Tier 2 — infrastructural, cheap now / expensive later
- [x] T2.1 `RUNBOOK.md` + `RUNBOOK.md` — 30 min
- [x] T2.2 `STATUS.md` 13-layer table — 30 min
- [x] T2.3 `scripts/backup-db.sh` + `npm run db:backup` (online `.backup`, keeps last 10,
      `BACKUP_DIR` override, cron one-liner in RUNBOOK). Test restore **run and verified**
      2026-09-01: row counts matched, `PRAGMA integrity_check` = ok. (F13, Phase 9.7)
- [x] T2.4 `lib/logger.ts` (JSON line per log to stdout/stderr, size-rotated file when
      `LOG_DIR` set, level filter, no deps, PII rule documented) + `lib/api-error.ts`
      `serverError()` — logs the stack with a short ref id, returns a generic Persian
      500 carrying that id. Wired into `/api/billboards`, `/billboards/[slug]`,
      `/billboards/pins`, `/reservations`, `/admin/billboards`. `app/error.tsx` shows
      `error.digest` as «کد خطا». (F12, Phase 4 + 5.3)
- [x] T2.5 `npm audit` → `STATUS.md`. 10 advisories (1 mod, 9 high), **all**
      build-time (postcss) or in an unused feature (sharp / `next/image`), none on the
      request path. The `next` CVEs were fixed by bumping to `16.2.11` (2026-09-02); the
      post-presentation bump, documented with rationale + monthly re-check note.
- [x] T2.6 Object-level authz — `/api/reservations/my` confirmed scoped by session
      (test: user B cannot see user A's reservation). Admin GET/POST confirmed to
      enforce role at the route, not just the UI. `/api/reviews` + admin `[id]` still
      worth a direct read. (F14, Phase 7.4)
- [x] T2.7 `LICENSE` (MIT) added earlier. README: architecture section rewritten as
      neutral documentation (no «for the reviewer» tone), accurate mermaid + file→layer
      table, correct DB description, links to `docs/architecture.md` + `docs/api.md`.
      Clean-machine `npm ci` walkthrough + screenshots: still pending (next round).

#### Tier 3 — fast wins, high value/minute
- [x] T3.1 Real counts from `dev.db` (3545 billboards / 2015 with images / 3032 geocoded)
      propagated to STATUS.md (was 2808) and codemap.html. `lib/data.ts` role
      corrected everywhere. (F8)
- [x] T3.2 `project-ai.zip` deleted from the working tree (was never committed;
      regenerable via the README zip command). `.gitignore` already excludes it.
- [ ] T3.3 Responsive spot-check at 360/390/768/1280 on landing, explore, detail,
      dashboard; fix only hard breaks (horizontal scroll, unreachable buttons)
      (Phase 9) — 1.5 h
- [x] T3.4 `AnalyticsTab` confirmed — `components/AnalyticsTab.tsx` fetches
      `/api/analytics?city=…` (client), does not touch `lib/data.ts`.
- [x] T3.5 (added) HTTP cache headers on the remaining cacheable GET routes:
      `/api/stats` (`max-age=120`), `/api/analytics` (`max-age=60`), `/api/reviews`
      (`max-age=30`) — were `no-store`/absent. Safe incremental tuning.

#### Won't fit / deliberately skipped (tell the professor)
- Full load test 50–200 concurrent users (Phase 8.8) — partially done: `npm run bench`
  gives ~108 req/s on `/api/billboards` in dev mode, throughput flat from 20→50 clients
  (single Node process + sync SQLite reads = the ceiling). First hard limit under write
  load is SQLite's single-writer lock on `POST /api/reservations`.
- CI/CD pipeline (Phase 13.4) — no test suite to run; not worth it for a local demo.
- Writing a real test suite (Phase 7 / 16) — 5 days is not enough to do it honestly.
- Redis-backed rate limit / audit persistence (Phase 8.7 / 6.6) — single instance,
  in-memory is fine; stated as a known limitation.
- Brotli/caching server, CDN, load balancing, read replicas, multi-tenancy,
  containerisation, API versioning, GDPR pipeline, SPF/DKIM/DMARC, payment gateway
  (Phase 10 / 15) — Overkill for a capstone; see `STATUS.md`.
- Structure refactor / file moves (Phase 1) — current layout is already conventional
  Next.js; a move this close to the deadline is pure risk.

### Progress log

- 2026-09-01 — Created `docs/STATUS.md`, `STATUS.md`, `RUNBOOK.md`,
  `RUNBOOK.md`, `.env.example`; hardened `.gitignore`; added `/prod-audit` command and
  standing rules to `CLAUDE.md`. No application code changed.
- 2026-09-01 — `git init`; excluded 712 MB of scraped images + raw dumps; added
  `LICENSE` (MIT); first commit `cf77994` on `main`; pushed to private GitHub repo
  `alireza-zareian/Rasamap-Repository` over SSH. Verified pushed tree: 155 files, no
  secrets. **Next:** revoke the leaked `ghp_` token; tag a demo version before the
  presentation.
- 2026-09-01 — Added `test/` — dependency-free API test suite (`npm test`, 19 tests
  passing) on an isolated `prisma/test.db`, plus `npm run bench`. No application code
  changed. Covers T1.5 (automated) and most of T2.6. Race guard verified.
- 2026-09-01 — Architecture: confirmed the app is already API-driven for every client
  interaction (mapped all 8 pages); the only direct-DB path is the `/billboard/[slug]`
  Server Component, which is the idiomatic Next.js pattern. Added `GET /api/billboards/[slug]`
  so every resource also has a REST endpoint (+3 tests, +2 smoke tests → 24/24). Wrote
  `docs/architecture.md` (two data paths, kitchen analogy, perf comparison, DRF contrast)
  and `docs/api.md` (~23-endpoint reference). Rewrote the stale README architecture section
  (it still claimed "no real DB" and "pages import lib/data.ts"). Added a standing rule to
  CLAUDE.md + AGENTS.md: reviewer-facing reports must carry the architecture explanation.
- 2026-09-01 — F15 fix: split `lib/data.ts` → new `lib/types.ts` (types +
  `typeLabels`/`typeIcons`, zero data). Repointed 20 import sites to `@/lib/types`.
  `lib/data.ts` (static/scraped arrays + 4 MB JSON) is now imported only by
  `prisma/seed.ts`. Result: client chunks **7.7 MB → 1.0 MB**, the 6.7 MB scraped-JSON
  chunk gone. Verified: `tsc` clean, `npm run build` OK, `npm test` 19/19, lint delta
  zero (36 pre-existing errors untouched). Behaviour unchanged — types are compile-time
  only, `typeLabels`/`typeIcons` moved verbatim. Docs updated (CLAUDE.md, AGENTS.md,
  STATUS.md, codemap.html).
- 2026-09-01 — Batch (PLAN groups A/B/C + safe tuning): structured logger
  (`lib/logger.ts` + `lib/api-error.ts`, error ref ids, wired into 5 routes +
  `error.tsx`); `npm run db:backup` + verified test restore; `npm audit` →
  `STATUS.md` (all 10 deferred with rationale); doc row-counts corrected
  (2808→3545); `project-ai.zip` deleted; `/list-media` per-step validation; HTTP cache
  headers on `/api/stats` `/api/analytics` `/api/reviews`; README + `docs/architecture.md`
  re-toned as neutral documentation (agent directive kept only in CLAUDE.md/AGENTS.md);
  roadmap footer synced. Verified: `tsc` clean, `npm run build` OK, `npm test` 24/24,
  `npm run lint` 36 errors (unchanged, −1 warning). Reviewed Tadrisino (internship
  Django repo) for transferable patterns — see the backlog below.

- 2026-09-01 — Batch (backlog N1 + part of N2): `lib/env.ts` + `instrumentation.ts`
  fail-closed env validation at startup; `lib/auth/client-ip.ts` `getClientIp()` with
  `TRUSTED_PROXY_COUNT` (fixes X-Forwarded-For spoofing of rate-limit buckets) applied
  across all 20 API routes; race-guard test widened to 10 concurrent → exactly one 201;
  durable audit — `persistAudit()` writes `billboard_create/update/delete` and
  `reservation_status_change` to the `audit_logs` table (already in the DB, no
  migration), `/api/admin/audit` now returns `{ logs, persisted }`. Verified: tsc clean,
  build OK, `npm test` 25/25, lint 63 (unchanged, 0 added). **Deferred, needs your OK:**
  Idempotency-Key + `Reservation` slot unique constraint (needs one
  `prisma db push --accept-data-loss` on dev.db — Prisma's AI guard blocks it without
  explicit consent; dev DB, backed up, verified no duplicate rows so no real data loss).
  **Assessed and skipped (not Iran — fit/risk):** PPR, streaming, `useOptimistic`,
  `next/image`, request-log HOF wrapper — the app is client-component-heavy so PPR/
  streaming barely apply; the booking flow correctly waits on server validation so
  `useOptimistic` would add complexity for negative value; `next/image` is high blast
  radius for marginal gain. The real wins (bundle split 7.7→1.0 MB, cache headers) are done.

- 2026-09-01 — Batch: `docs/engineering-decisions.md` — the standing record of
  which systems the project runs, what structure each produces, why, and where it
  applies (the spine for later visual reports). `npm run db:seed:demo:full` —
  idempotent demo dataset: 8 users (one per state), 4 admins (one per role), 3
  owners + 4 pending listings, 13 reservations across all statuses, 3 reviews;
  account sheet in `RUNBOOK.md`. `/api-docs` — self-hosted, no-CDN
  in-app render of `docs/api.md` (traced into the prod build via `next.config.ts`).
  Verified: tsc clean, build OK, `npm test` 25/25, lint 63 (unchanged), seed
  idempotent, `/api-docs` 200 under `next start`.

### Next update — prioritized backlog (awaiting go-ahead)

Merges patterns worth borrowing from Tadrisino with what is still open here. Nothing
below is started. Grouped by value-for-effort; each notes whether it needs a Prisma
migration or touches product behaviour.

#### N1 — quick, safe, do first
- [x] `lib/env.ts` + `instrumentation.ts` — fail-closed env validation at startup.
- [x] X-Forwarded-For trust fix — `lib/auth/client-ip.ts` `getClientIp()` +
      `TRUSTED_PROXY_COUNT`, applied to all 20 API routes.
- [x] Race test widened to 10 concurrent identical POSTs → exactly one 201.

#### N2 — worth it, moderate effort
- [x] Persist status-change audit — `persistAudit()` to the existing `audit_logs`
      table (no migration). `billboard_create/update/delete`, `reservation_status_change`.
      `/api/admin/audit` now returns `{ logs, persisted }`.
- [x] **Idempotency-Key** on `POST /api/reservations` and `POST /api/listings` +
      `Reservation(billboardId,userId,startDate,endDate)` unique constraint. Migration
      `20260901120500` hand-applied to dev.db (additive only; `prisma migrate dev`
      wanted a full reset over pre-existing billboards-table drift). `lib/idempotency.ts`,
      +2 tests. 27/27.
- [x] Structured request-log HOF (`lib/api-log.ts` `withApiLog`) — now wired into
      **every** API route (all 23 files, GET/POST/PUT/PATCH/DELETE). Each request
      emits one `api_request` line: route/method/path/status/ms, no body/headers/PII.
      Verified live.
- [x] DB-backed audit **viewer** — AuditPanel has a پایدار/زنده toggle; the persisted
      view renders `audit_logs` rows with their `details`.
- [~] Responsive — added `html,body { overflow-x: clip }` safety net; the `@media 640`
      block already collapses every multi-col grid; narrowed CompareModal's fixed column.
      **Still needs a real-browser pass at 360/390/768/1280** — could not verify headless.
- [x] Clean-machine walkthrough — actually ran `git clone` → `npm ci` → `prisma migrate
      deploy` → `npm run db:seed` → `npm run build` in a temp dir. **Found and fixed two
      real breakers:** (1) `prisma.config.ts`'s `env("DATABASE_URL")` threw during
      `postinstall: prisma generate` before any `.env` exists → switched to a
      `process.env.DATABASE_URL ?? "file:./dev.db"` fallback; (2) the migration history
      built a `billboards` table missing `hasImages` / `ownerId` / most indexes (added to
      `dev.db` earlier via `db push`, never migrated) → `db:seed` failed with P2022. Added
      migration `20260901123000_reconcile_billboards_schema` (from `prisma migrate diff`),
      marked applied on `dev.db`, verified a fresh DB now migrates + seeds 3545 rows.
      `prisma migrate status` → "up to date". `prisma/seed.ts` also got `import
      "dotenv/config"` + a URL fallback. README setup now says `cp .env.example .env`.
      Screenshots still pending (can't capture headless).

#### N3 — post-presentation polish (architectural shape is already fine)
> Assessed 2026-09-01: PPR, streaming and `useOptimistic` are a poor fit for the
> current codebase (landing / explore / dashboard are all `"use client"`, and the
> booking flow must wait on server-side overlap validation — optimistic UI there would
> add rollback complexity for no gain). `next/image` touches every card image for a
> marginal payoff. Left here as deliberate, low-priority polish, not recommended before
> the presentation.
- [ ] `next/image` for scraped photos (`remotePatterns` + full visual test) — also
      clears the `sharp` audit advisory. STATUS.md P5.
- [ ] Partial Prerendering on `/explore` (`experimental_ppr`) — only worthwhile after a
      Server-Component refactor of the page. STATUS.md P7.
- [ ] `useOptimistic` / Server Action on the booking form — only if the flow is
      reworked so the client can safely predict the outcome. STATUS.md P8.
- [ ] More of the detail-page chrome as Server Components / streaming. STATUS.md P6.
- [ ] `@next/bundle-analyzer` pass. STATUS.md P9. · JSON-LD on detail pages. P10.
- [x] Bumped `next` 16.2.9 → 16.2.11 (2026-09-02) — closed 10 Next.js advisories
      incl. the App-Router proxy-bypass. Remaining `npm audit` items (postcss/sharp/
      mysql2/…) are transitive build-tooling / unused paths — see `STATUS.md`.
      Clearing those needs `next@16.3.x`; deferred post-presentation.
- [x] Lint debt cleared — 63 problems → 10 (0 errors). Real fix in AnalyticsTab;
      the rest were legit data-fetch / mount-hydration effects, scoped-disabled with a
      reason. Remaining 10 are `@next/next/no-page-custom-font` (error/404 pages must
      carry their own font link — no App Router fix) + 2 benign `exhaustive-deps`.
- [x] `/api-docs` — self-hosted render of `docs/api.md` (no CDN, works offline). Done
      in an earlier batch.

#### Not bringing from Tadrisino (would be bloat here)
- Internal-service-key / webhook-secret permission classes — no server-to-server
  endpoints in this app.
- `SELECT … FOR UPDATE` lock semantics — SQLite has no row locks; a transaction + a
  unique constraint is the correct tool.
- Grafana / Loki / Alloy stack — the JSON-lines logger + rotated file is the free
  self-hosted equivalent; a full LGTM stack is Overkill for a capstone.
- A `manage.py`-style CLI — npm scripts already cover it.

---

# ارزیابی ۱۳ لایه‌ای (AUDIT)

## AUDIT — 13-Layer Production Stack Assessment

> Project: Rasamap (billboard marketplace). Level: bachelor capstone. Traffic: a few
> concurrent users at a live demo. Constraints: solo dev, ~5 days, Iran (no paid/
> region-blocked SaaS), demo runs locally or on a private server.
>
> Verdict key: **Required** = do it, a reviewer will notice its absence ·
> **Worth it** = real value for the effort, do if time allows ·
> **Overkill** = correct for a real product, not for this capstone (say so out loud).

| # | Layer | Has today | Missing | Verdict | Justification |
|---|-------|-----------|---------|---------|---------------|
| 1 | Front-end foundations | Next 16 App Router, React 19, RTL Persian, inline-CSS design system, `error.tsx` + `not-found.tsx`, loading states on some routes | Consistent empty/error/retry states on every list; mobile passes; some UX-breaking stubs (contact form, list-media file input) | **Required** (bug fixes + unhappy-path), **Worth it** (mobile) | It is the whole demo surface. Fix what visibly breaks; full redesign is out of scope. |
| 2 | APIs & backend logic | ~20 route handlers, Zod `.safeParse()` everywhere, allowlists for sort/filter, consistent Persian error payloads, rate-limit + auth ordering enforced | Structured request logging; a couple of stub endpoints | **Required** (keep the discipline), **Worth it** (logging) | Already strong. Logging is the main gap professors probe. |
| 3 | Database & storage | Prisma 7 schema, FKs, unique constraints (`slug`, `phone`, `review`), composite indexes matching query patterns, WAL mode, seed vs demo seed separated | Automated backup + tested restore; denormalised sort keys (`area`, `estimatedViews`) indexed | **Required** (backup + restore doc), **Worth it** (sort correctness) | "Do you have backups?" is a guaranteed question. SQLite `.backup` is one command. |
| 4 | Auth & permissions | JWT HttpOnly + SameSite=Strict cookies, bcrypt cost 12, timing-safe dummy hash, no user enumeration, `proxy.ts` guard, RBAC `viewer<editor<admin<super_admin` | Object-level authz spot-check; password reset flow (none exists) | **Required** (authz check), **Worth it** (reset), **Overkill** (email verification) | Being logged in ≠ authorised for a given row — must verify. No email service in Iran → reset is a stretch. |
| 5 | Hosting & deployment | Runs with `npm run build && npm start`; security headers + HSTS in `next.config.ts` | Deterministic documented deploy steps; env separation doc | **Required** | `RUNBOOK.md` + `RUNBOOK.md` cover this. Cheap, expected. |
| 6 | Cloud & compute | Single Node process, single SQLite file | Nothing | **Overkill** | Capstone demo. No cloud compute needed; say so. |
| 7 | CI/CD & version control | **Not a git repo yet**; `.github/` folder present but unused | `git init`, `main` branch discipline, tag for presentation; CI only if tests exist | **Required** (git), **Overkill** (CI) | No history = no rollback and a bad portfolio look. CI has nothing to run — no test suite. |
| 8 | Security & row-level security | CSP + security headers, bot-UA blocking, input validation, ORM-only (no string SQL), per-user listing scoping, upload magic-byte validation, anti-scraping limits, `npm` lockfile committed | Per-user data-isolation spot-check across all `[id]` routes; `npm audit` run; `LICENSE` | **Required** | Change-an-ID test and a dependency audit are quick and high-signal. |
| 9 | Rate limiting | Sliding-window per-IP/per-user on login, register, public API, admin API; lockout + audit entry on breach | Persistence across restart (in-memory today) | **Required = already met**; persistence is **Overkill** | Single instance; a restart clearing counters is acceptable and disclosed. |
| 10 | Caching & CDN | `Cache-Control: max-age + stale-while-revalidate` on public billboard API; Next static optimisation; font preload | Response compression config; fragment/page caching; image WebP+resize | **Worth it** (compression, image resize), **Overkill** (CDN, cache server) | Next/Node gzip is basically free. A CDN for a demo is pointless. |
| 11 | Load balancing & scaling | None | Horizontal scaling, connection pooling beyond SQLite | **Overkill** | SQLite + single instance is a deliberate, defensible capstone choice. First bottleneck under load = single-writer lock on listing POSTs; name it, don't fix it. |
| 12 | Error tracking & logs | `console.error` guarded by `NODE_ENV`, in-memory audit ring buffer (500 entries) for admin actions | Structured JSON logs to a rotating file, request/error reference IDs surfaced to users, audit trail persisted | **Worth it** (self-hosted structured logs + reference ID), **Overkill** (Sentry/paid) | The in-code equivalent of error tracking. Directly answers an examiner question. |
| 13 | Availability & recovery | None documented | Backup schedule, restore procedure, rollback plan, uptime check | **Required** (backup + `RUNBOOK.md` rollback), **Overkill** (uptime monitor for a non-public demo) | Recovery story must exist on paper. External uptime pinging is moot if it is not public. |

### What was changed, by layer

- **L3 / L13 — recovery:** `RUNBOOK.md` + `RUNBOOK.md` added. Backup script
  + tested restore: _pending (PLAN T2.3)._
- **L5 / L7 — deploy & git:** `.env.example` added; `.gitignore` hardened to exclude
  `*.db*`, archives and logs and to keep `.env.example`. `git init` + first commit:
  _pending user approval (PLAN T1.3)._
- **L8 — security:** `npm audit` + object-level authz spot-check: _pending (PLAN T2.5,
  T2.6)._ `LICENSE`: _pending (PLAN T2.7)._
- **L12 — logs:** minimal structured logger + user-facing error reference ID: _pending
  (PLAN T2.4)._
- **L1 / L2 — front-end & API:** "try to break it" pass + U7 bug fixes: _pending
  (PLAN T1.5, T1.6)._
- **Layers 6, 11:** consciously left empty — documented as Overkill above; to be stated
  in the presentation summary as deliberate, justified omissions.

_Last updated: 2026-09-01._

---

# کارهای بعدی

## وظایف بعدی — اولویت‌بندی شده

> **آخرین آپدیت:** ۸ شهریور ۱۴۰۵  
> وضعیت DB: 3545 بیلبورد · 1924 با تصویر · 3032 geocoded

---

### P1 — صفحه تحلیل بازار زنده (اثر بالا، زمان متوسط)

**مشکل:** `AnalyticsTab.tsx` از `lib/data.ts` می‌خواند — داده‌های hardcoded کاملاً استاتیک‌اند.  
`regionStats` و `marketKPIs` هیچ ربطی به DB ندارند.

**راه‌حل:**
1. Endpoint جدید `GET /api/analytics?city=...` — aggregate واقعی از DB:
   - count به تفکیک type، status، city
   - میانگین قیمت، محدوده قیمتی
   - % دسترسی (available/total)
   - top 5 شهر بر اساس تعداد
2. `AnalyticsTab` را rewrite کن: `useEffect` + `fetch("/api/analytics?city=...")` 
3. اضافه کردن dropdown فیلتر شهر → با تغییر، داده live آپدیت می‌شود
4. KPI واقعی: تعداد کل از DB، % خالی از DB، میانگین قیمت از DB

**فایل‌ها:** `app/api/analytics/route.ts` (جدید) · `components/AnalyticsTab.tsx`

---

### P2 — اسکریپت: جلوگیری از عکس‌های placeholder (ریشه‌ای)

**مشکل:** اسکریپت billboardiha عکس‌ها را فقط بر اساس نام فایل cache می‌کند — محتوای عکس چک نمی‌شود.  
عکس «no image» سایت (یک گرافیک ثابت) برای هزاران بیلبورد دانلود می‌شود.  
ما در DB cleanup آن‌ها را پاک کردیم ولی فایل روی disk ماند.

**راه‌حل:**
1. بعد از دانلود هر عکس، MD5 محتوای آن را محاسبه کن
2. اگر hash در `PLACEHOLDER_HASHES` بود: فایل را حذف کن، آن URL را skip کن
3. `PLACEHOLDER_HASHES` را auto-detect کن: در اولین اجرا هر hash که 3+ بار تکرار شد → placeholder
4. Set آماده: hash عکس‌های «بدون تصویر» billboardiha را از disk موجود استخراج کن

**چرا تعداد عکس‌ها کم شد:**  
پس از اینکه در DB تصاویر را NULL کردیم، فایل‌ها روی disk ماندند.  
اسکریپت می‌بیند `{uid}_0.jpg` روی disk هست → `can_skip = True` → detail fetch نمی‌کند → عکس‌ها در JSON قدیمی بودند.  
**فیکس کوتاه‌مدت:** در منطق `can_skip` علاوه بر بررسی disk، images لیست را در state قبلی هم چک کن — اگر خالی بود، از cache استفاده نکن.

**فایل‌ها:** `scraper/scraper_billboardiha.py`

---

### P3 — فرمول ترافیک و viewability واقعی (اثر متوسط)

**مشکل:** همه بیلبوردهای DB از seed می‌آیند با:  
`traffic: { daily: 0, estimatedViews: 0, viewabilityScore: 0 }`  
عدد ۰ در کارت‌ها و صفحه مشخصات نمایش داده می‌شود.

**راه‌حل — فرمول تخمینی بر اساس ویژگی‌های موجود:**
```
area = width × height
city_factor = { تهران: 1.0, مشهد: 0.7, اصفهان: 0.65, شیراز: 0.6, ... }
type_factor = { billboard: 1.0, digital: 1.4, bridge: 0.8, station: 0.6 }

daily_traffic = base_city_traffic × city_factor × type_factor
estimatedViews = daily_traffic × 0.15   (15% توجه)
viewabilityScore = min(100, area × 2 + city_factor × 30 + type_factor × 20)
```

اجرا با migration یا backfill script پس از seed.

**فایل‌ها:** `scripts/backfill-traffic.ts` (جدید) · `package.json` (دستور جدید)

---

### P4 — قیمت‌های پیش‌فرض واقع‌بینانه (اثر کم، زمان کم)

**مشکل:** بیلبوردهایی که قیمت از scraper ندارند با `price: 0` ثبت می‌شوند.  
فرمول‌های weekly/quarterly/yearly درست است اما قیمت پایه ۰ است.

**راه‌حل — فرمول backfill برای price=0:**
```
base = city_tier × area × type_multiplier
city_tier = { تهران: 8, مشهد: 5, اصفهان: 4.5, ... , سایر: 2 }  (میلیون تومان/m²)
```

این را در همان backfill script P3 انجام بده.

---

### P5 — صفحه مقایسه: thumbnail و consistency (اثر UX)

**مشکل:** صفحه compare بیلبوردها را بدون تصویر نمایش می‌دهد.  
همچنین grid 4 آیتم اما modal فقط 2 را مقایسه می‌کند — ناسازگاری.

**راه‌حل:**
- thumbnail 80px از `b.images[0]` اضافه کن
- حداکثر مقایسه را به 3 برسان یا grid را به 2 تبدیل کن

**فایل‌ها:** `app/compare/page.tsx`

---

### ترتیب پیشنهادی اجرا

| # | کار | زمان تخمینی | اثر |
|---|-----|-------------|-----|
| 1 | Analytics live (P1) | ۱–۲ ساعت | بالا |
| 2 | Scraper dedup تصویر (P2) | ۱ ساعت | بالا |
| 3 | Backfill traffic + price (P3+P4) | ۱ ساعت | متوسط |
| 4 | Compare thumbnail (P5) | ۳۰ دقیقه | UX |

---

### یادداشت‌های فنی

- Analytics endpoint باید `session check` نداشته باشد (public page)
- Backfill script را با `--dry-run` flag بساز تا قبل از اجرا preview داشته باشیم
- Placeholder hash detection: `from hashlib import md5; md5(open(f,'rb').read()).hexdigest()`
- `can_skip` fix: `if uid in previous_ids and has_image and prev_record_has_images:`

---

# ممیزی امنیتی و وضعیت npm audit

## Dependency security audit

Run `npm audit` and review this file monthly, and before every release.

Lockfile: `package-lock.json` is committed and pins exact versions, so every
machine installs the same tree.

### 2026-09-02

Bumped **`next` 16.2.9 → 16.2.11** (a patch inside the pinned minor). That
release closes **10 Next.js advisories** whose range was `>=16.0.0 <16.2.11`,
including one that matters here:

| Advisory | Severity | Relevance |
|---|---|---|
| Middleware / Proxy bypass in App Router (Turbopack, single locale) | high | **Directly relevant** — Rasamap is App Router + single locale + Turbopack, and `proxy.ts` is the auth boundary. Fixed by the bump. |
| Unauthenticated disclosure of internal Server Function endpoints | moderate | Fixed. |
| SSRF in rewrites via attacker-controlled destination | high | We have no rewrites; fixed anyway. |
| DoS in Server Actions / unbounded Server Action payload / cache confusion on bodies / image-optimization SVG DoS | mixed | Mostly not on our paths; fixed anyway. |

`tsc`, `npm run lint` (0 errors), `npm run build`, `npm test` (27/27) all pass
on 16.2.11.

#### Remaining after the bump — 12 advisories, none exploitable here

All are transitive dependencies of build/dev tooling or of a feature the app
does not use. None are reachable from user input at runtime.

| Package | Via | Why it does not apply |
|---|---|---|
| `postcss` (`<=8.5.22`) | `@tailwindcss/postcss`, `next` | Build-time CSS processing. We author our own CSS; no untrusted CSS is ever processed. |
| `sharp` (`<0.35.0`) | `next` | Image optimization. The app has **no `next/image` usage** — images are plain `<img>`. `sharp` is installed transitively but never invoked. |
| `mysql2` (`<3.22.0`) | `prisma` (`@prisma/config` optional driver) | SQLite project. The MySQL driver is never loaded. |
| `nanoid`, `brace-expansion`, `browserslist`, `js-yaml`, `deepmerge-ts` | `next`, `prisma`, build tooling | Dev/build-time only (glob matching, browserslist, YAML/config parsing). Not on the request path. |

Clearing these needs `next@16.3.x` (a minor bump) or `overrides` entries. Both
carry regression risk for a working demo and none of the issues are
exploitable in this deployment, so they are **deferred to the first
post-presentation maintenance pass**, together with the `next/image` migration.

#### Do not run `npm audit fix --force`

It pulls `next@16.3.4` (outside the pinned minor) — a framework bump this close
to the presentation. Bump deliberately, then re-audit.

#### How to re-check

```bash
npm audit               # summary
npm audit --json        # full detail
npm outdated            # what could be updated
```
