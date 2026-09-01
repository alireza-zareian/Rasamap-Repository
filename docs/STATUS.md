# Rasamap — وضعیت پروژه

> این فایل جایگزین خواندن `roadmap.html` برای Claude است.
> هر session جدید: این فایل را بخوان → وضعیت کامل را بفهم → شروع کن.

---

## اطلاعات پایه

- **پروژه:** پلتفرم رزرو آنلاین رسانه‌های تبلیغاتی محیطی (بیلبورد) — thesis دانشگاهی
- **Stack:** Next.js 16.2.11 App Router · React 19 · TypeScript 5 strict · SQLite + Prisma 7 · JWT HttpOnly · Leaflet · Inline CSS (بدون Tailwind class در JSX)
- **DB:** 3545 بیلبورد (2660 billboard, 793 bridge, 79 station, 13 digital) · 2015 با تصویر · 3032 geocoded
- **ارزیابی کد:** A− برای thesis — security غیرمعمول قوی

---

## قوانین غیرقابل نقض (هرگز نقض نکن)

1. Zod `.safeParse()` — هرگز `.parse()` یا `JSON.parse(userInput)`
2. Admin route order: `session → rate limit → Zod → business logic`
3. DB reads: همیشه از `lib/db/billboards.ts` — هرگز از `lib/data.ts`
4. همه رشته‌های user-visible به فارسی
5. Styling: فقط `style={{}}` inline — هیچ Tailwind class در JSX
6. بعد از هر تسک: این فایل را آپدیت کن (تیک بزن)
7. Proxy (نه middleware): فایل `proxy.ts` در root

---

## تصمیم‌های ثابت (دست نزن)

- Scraper/geocoding: deferred — بعد از ارائه
- SQLite: کافی است — تغییر DB ممنوع
- Guest checkout نه — reservation نیاز به login دارد
- Types و `typeLabels` از `lib/types.ts` (بدون دیتا). `lib/data.ts` فقط دیتاست استاتیک/scraped + JSON ۴MB است و **فقط** `prisma/seed.ts` آن را import می‌کند — import آن از کد کلاینت/صفحه کل دیتاست را وارد باندل مرورگر می‌کند

---

## وضعیت فازها

### ✅ فازهای اصلی — کامل

- [x] **Phase 3** — DB Schema + Migration (Prisma, seed, 3545 رکورد)
- [x] **Phase 4** — Public API + Explore/Landing از DB می‌خوانند
- [x] **Phase 5** — ⏸ Scraper Pipeline (deferred — در loop geocoding افتاد)
- [x] **Phase 6** — Admin CRUD: PUT/DELETE بیلبورد از DB
- [x] **Phase 7a** — User Auth: register/login/logout/me + proxy guard
- [x] **Phase 7b** — Reservation API: POST + overlap check + dashboard واقعی
- [x] **Phase 8** — QA: error.tsx, not-found.tsx, pagination Explore, admin component split
- [x] **Phase 9** — Demo Prep: demo-script.html, seed-demo.ts, پاسخ سؤالات داور

### ✅ بهبودهای معماری — کامل

- [x] **A1** — Server-side filtering/pagination (نه کل 3545 رکورد به client)
- [x] **A2** — list-media: POST /api/listings واقعی (status "pending")
- [x] **A3** — ImageManager: PUT /api/admin/billboards/[id]/images واقعی
- [x] **A4** — BookingModal: فیلدهای اضافی حذف، اطلاعات از JWT session
- [x] **A5** — Admin reservation management panel
- [x] **A6** — SEO: sitemap.xml (3545 billboard + 4 صفحه اصلی)

### ✅ بهبودهای پرفورمنس — کامل (۲۰۲۶ standards)

- [x] **P1** — WAL mode + synchronous=NORMAL + foreign_keys=ON روی SQLite connection (`lib/db/client.ts`)
  - concurrent reads بدون SQLITE_BUSY — ضروری برای ارائه با چند داور همزمان
- [x] **P2** — Composite indexes: `(city,status)`, `(city,type)`, `(type,price)` در `prisma/schema.prisma`
  - ⚠️ نیاز به اجرا: `npx prisma db push`
- [x] **P3** — Font preload: `<link rel="preload" as="style">` برای Vazirmatn در `app/layout.tsx`
  - مرورگر font CSS را زودتر fetch می‌کند → LCP بهتر
- [x] **P4** — Cache-Control از `max-age=30/120` به `max-age=60/300` در `/api/billboards`

#### 📋 پس از ارائه — مستند، پیاده نشده

- [ ] **P5** — `next/image` برای scraped images (نیاز به `remotePatterns` در next.config + full test)
- [ ] **P6** — Server Components refactor برای `billboard/[slug]/page.tsx` (static parts → RSC)
- [ ] **P7** — PPR (Partial Prerendering) روی explore page — `experimental_ppr = true`
- [ ] **P8** — Server Actions + `useOptimistic` برای BookingModal
- [ ] **P9** — Bundle analyzer: `npx @next/bundle-analyzer` — شناسایی chunk های بزرگ
- [ ] **P10** — JSON-LD structured data روی billboard detail pages (SEO)

---

### ✅ بهبودهای امنیتی — کامل

- [x] **S1** — Rate limiting sliding window (login + API)
- [x] **S2** — Zod validation همه ورودی‌ها + allowlist sort/filter
- [x] **S3** — bcrypt cost 12 + timing-safe dummy hash
- [x] **S4** — RBAC: super_admin > admin > editor > viewer

### ✅ بهبودهای کیفیت — کامل

- [x] **Q1** — admin/page.tsx تقسیم به components/admin/
- [x] **Q2** — error.tsx + not-found.tsx فارسی
- [x] **Q3** — lib/db/client.ts با explicit driver adapter

### ✅ فیچرهای اضافه — کامل

- [x] **F1** — Analytics page (/analytics)
- [x] **F2** — Compare: localStorage sync + CompareModal (حداکثر 2 آیتم)
- [x] **F3** — Billboard detail: BillboardGallery + ShareButton + Breadcrumb
- [x] **F4** — TrafficMeter component در detail page
- [x] **F5** — Reviews: جدول Review در Prisma + GET/POST /api/reviews + ReviewsSection
- [x] **F6** — /list-media gate به login (proxy.ts)

### ✅ UI/UX فازهای اول — کامل

- [x] **UX0** — Visual Audit: پالت قدیمی (نارنجی) جایگزین با آبی (#3B7BF5) + warm amber
- [x] **U1** — Landing: hero parallax + gallery sliding + CTA + footer + stats از DB
- [x] **U2** — Explore: server-side filter + map pins (3032 geocoded) + Topbar + URL params
- [x] **U3** — Billboard detail: gallery lightbox + ShareButton + breadcrumb + TrafficMeter
- [x] **U4** — Polish: BillboardCard یکپارچه + ticker زنده + about/contact/terms + footer سراسری + hero compact یک‌خطی
- [x] **U4b** — BackgroundPattern: خطوط vine از صفر شروع می‌کنند و با اسکرول با ease-in-out و cascade تدریجی رشد می‌کنند (vine1 از scroll=0, vine2 از scroll=5%, vine3 از scroll=12%)

---

## 🚀 فازهای بعدی — باید انجام شوند

### U5 — تصویر انسانی و اعتمادسازی
> **اولویت: اول** | مطالعات: +45-105% conversion با تصویر انسانی واقعی

- [ ] لندینگ: section «مشتریان می‌گویند» — 3 testimonial card با آواتار رنگی (حرف اول)، نام فارسی، شرکت، نقل‌قول خاص
- [ ] لندینگ: نوار برند «همراه برندهایی مثل...» — 4-5 لوگوی تایپوگرافی ساده فارسی
- [ ] لندینگ stats bar: حذف/جایگزینی آمار `۱۲M+ بازدید` hardcoded — با آمار واقعی DB یا حذف آن
- [ ] About page: بازنویسی کامل — داستان، ارزش‌ها، «چرا رسامپ؟» با 3 ستون مزیت
- [ ] Footer: placeholder بصری برای Enamad badge

**فایل‌ها:** `app/page.tsx`, `app/about/page.tsx`

---

### U6 — کاهش حس AI / میکرو-انیمیشن
> **اولویت: دوم** | Anti-AI design trend 2025-2026

- [ ] `globals.css`: shimmer animation — جایگزینی همه emoji fallback (🏙️) با shimmer rect animated
- [ ] `components/BillboardCard.tsx`: hover → image `scale(1.03)` 0.4s ease
- [ ] لندینگ: «آنلاین رزرو کن» با `var(--accent-warm)` به جای آبی در headline
- [ ] `globals.css`: subtle noise texture overlay روی body (4% opacity SVG filter)
- [ ] Typography: متن‌های توضیحی با `fontWeight: 300` برای contrast بهتر

**فایل‌ها:** `app/globals.css`, `components/BillboardCard.tsx`, `app/page.tsx`

---

### U7 — رفع باگ‌های UX-Breaking
> **اولویت: فوری** — این‌ها سایت را خراب می‌کنند

- [ ] **login shadow:** `rgba(255,77,0,0.4)` → `rgba(59,123,245,0.4)` در `app/login/page.tsx`
- [ ] **contact فرم تقلبی:** حذف disclaimer + فرم + جایگزینی با info cards صادقانه + لینک مستقیم mailto: و Telegram
- [ ] **contact icons:** جایگزینی emoji (✉️📱🏢⏰) با Lucide (Mail, Phone, Building2, Clock)
- [ ] **list-media step 4:** اضافه کردن `<input type="file" hidden>` با `onChange` handler واقعی
- [ ] **list-media validation:** بررسی required fields قبل از هر «بعدی»
- [ ] **compare thumbnails:** اضافه کردن عکس 64px به کارت‌های compare page

**فایل‌ها:** `app/login/page.tsx`, `app/contact/page.tsx`, `app/list-media/page.tsx`, `app/compare/page.tsx`

---

### U8 — پالیش داشبورد و پروفایل
> **اولویت: سوم**

- [ ] `components/UserAvatar.tsx` (جدید): دایره رنگی با حرف اول نام
- [ ] داشبورد: اضافه کردن UserAvatar در sidebar و greeting
- [ ] داشبورد: تغییر آیکون confirmed count از `Calendar` به `CheckCircle2` (الان دو Calendar داریم)
- [ ] داشبورد ردیف رزرو: thumbnail 64px بیلبورد + نام کلیک‌پذیر به `/billboard/slug`
- [ ] داشبورد empty state رزروها: زیباتر با icon بزرگ‌تر و متن راهنما

**فایل‌ها:** `app/dashboard/page.tsx`, `components/UserAvatar.tsx`

---

### U9 — ریسپانسیو / موبایل
> **اولویت: چهارم** | 78% کاربران ایرانی از موبایل

- [ ] Footer لندینگ: collapse → single column زیر 640px
- [ ] Dashboard sidebar: hamburger toggle زیر 768px
- [ ] لندینگ header: زیر 420px فقط لوگو + explore
- [ ] explore filters: bottom-sheet برای موبایل (از backlog U2)
- [ ] about stats: single column زیر 640px
- [ ] billboard gallery در detail: swipe gesture support

**فایل‌ها:** `app/page.tsx`, `app/dashboard/page.tsx`, `app/about/page.tsx`, `app/globals.css`, `app/explore/page.tsx`

---

### U10 — Map-First Explore (بلندمدت)
> **اولویت: بعد از MAP issues** | بزرگ‌ترین فرصت رقابتی — مثل AdQuick/Blip

- [ ] Map view به عنوان default در explore
- [ ] Price pins روی نقشه (مثل Zillow)
- [ ] «جستجو با حرکت نقشه» toggle (مثل Airbnb)
- [ ] در موبایل: list-first با sticky «نمایش نقشه»
- [ ] Card hover ↔ pin highlight sync (از backlog U2)
- [ ] Filter pills horizontal scroll بالای صفحه

**وابسته به:** حل MAP-A, MAP-B, MAP-C اول

---

## ⏸ مشکلات نقشه — تحقیق معوق

> قبل از هر تغییر، تحقیق ریشه‌ای لازم است — تعویض مکرر provider ممنوع

- [ ] **MAP-A** — شناسایی منشأ پیام «API Key Required» (console log، network tab)
- [ ] **MAP-B** — مختصات بیلبوردها نادرست — ردیابی pipeline: scraper → DB → geocoding → Leaflet
- [ ] **MAP-C** — لینک Google Maps در detail page — بررسی URL generation (lat/lng vs text query)
- [ ] **MAP-D** — مقایسه provider‌ها برای ایران: CARTO (فعلی) vs Neshan vs OSM Nominatim

**فایل‌های مرتبط:** `app/explore/map/page.tsx` (فعلاً فقط redirect به `/explore`)، `NESHAN_API_KEY` در env. کامپوننت `RealMap.tsx`/`MapView.tsx` در پاکسازی حذف شد — در تاریخچه‌ی git است اگر کار نقشه از سر گرفته شود.

---

## یافته‌های تحقیق رقبا (خلاصه)

### جهانی
- **AdQuick**: map-first، قیمت شفاف، booking فوری — «آمازون برای بیلبورد» — OOH Platform of Year 2025
- **Blindspot**: قیمت‌گذاری ساعتی، AI planner «Blinky»
- **Blip**: pure self-serve، $20/day بدون قرارداد

### ایرانی
- **Bineshmedia**: ادعای اول بودن در ایران، Enamad، فرم رزرو
- **Adnel**: کارت با عکس واقعی، Enamad، دسته‌بندی داخلی/خارجی
- **Billboardiha**: فیلتر استان/شهر، بخش مزایده

**فاصله رقابتی:** هیچ پلتفرم ایرانی ندارد: map browse واقعی + قیمت شفاف + رزرو فوری

### داده‌های روانشناسی
- تصویر انسانی واقعی: +45-105% conversion (مطالعات HubSpot، 37Signals، VWO)
- مغز تصاویر را 60,000× سریع‌تر از متن پردازش می‌کند
- Stock photo عمومی (کت‌وشلوار در اتاق جلسه): اعتماد را خراب می‌کند — نه عکس بهتر از stock بد

---

## فایل‌های کلیدی

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
    billboards/pins/route.ts  GET slim برای نقشه
    reservations/route.ts     POST + GET
    reservations/my/route.ts  GET رزروهای کاربر جاری
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

## دستورات

```bash
npm run dev              # localhost:3000
npm run build            # باید بدون خطا پاس شود
npm run lint
npm test                 # سوییت API (node:test) — ۳۷ تست
npm run bench            # بنچمارک بار (سرور dev باید بالا باشد)
npm run db:migrate
npm run db:seed          # 3545 رکورد
npm run db:seed:demo:full # حساب‌های دموی کامل (docs/demo-accounts.md) — idempotent
npm run db:backup        # بکاپ آنلاین SQLite → backups/
npm run db:studio        # Prisma Studio
```

**Env لازم:** `DATABASE_URL` · `AUTH_SECRET` · `ADMIN_EMAIL` · `ADMIN_PASSWORD_HASH` · `ADMIN_NAME` · `NESHAN_API_KEY`

---

## بعد از هر تسک

1. تیک بزن در این فایل ([ ] → [x])
2. `npm run build` را اجرا کن — باید پاس شود
3. `docs/roadmap.html` را فقط برای ارائه نهایی آپدیت می‌کنیم
