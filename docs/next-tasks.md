# وظایف بعدی — اولویت‌بندی شده

> **آخرین آپدیت:** ۸ شهریور ۱۴۰۵  
> وضعیت DB: 3545 بیلبورد · 1924 با تصویر · 3032 geocoded

---

## P1 — صفحه تحلیل بازار زنده (اثر بالا، زمان متوسط)

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

## P2 — اسکریپت: جلوگیری از عکس‌های placeholder (ریشه‌ای)

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

## P3 — فرمول ترافیک و viewability واقعی (اثر متوسط)

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

## P4 — قیمت‌های پیش‌فرض واقع‌بینانه (اثر کم، زمان کم)

**مشکل:** بیلبوردهایی که قیمت از scraper ندارند با `price: 0` ثبت می‌شوند.  
فرمول‌های weekly/quarterly/yearly درست است اما قیمت پایه ۰ است.

**راه‌حل — فرمول backfill برای price=0:**
```
base = city_tier × area × type_multiplier
city_tier = { تهران: 8, مشهد: 5, اصفهان: 4.5, ... , سایر: 2 }  (میلیون تومان/m²)
```

این را در همان backfill script P3 انجام بده.

---

## P5 — صفحه مقایسه: thumbnail و consistency (اثر UX)

**مشکل:** صفحه compare بیلبوردها را بدون تصویر نمایش می‌دهد.  
همچنین grid 4 آیتم اما modal فقط 2 را مقایسه می‌کند — ناسازگاری.

**راه‌حل:**
- thumbnail 80px از `b.images[0]` اضافه کن
- حداکثر مقایسه را به 3 برسان یا grid را به 2 تبدیل کن

**فایل‌ها:** `app/compare/page.tsx`

---

## ترتیب پیشنهادی اجرا

| # | کار | زمان تخمینی | اثر |
|---|-----|-------------|-----|
| 1 | Analytics live (P1) | ۱–۲ ساعت | بالا |
| 2 | Scraper dedup تصویر (P2) | ۱ ساعت | بالا |
| 3 | Backfill traffic + price (P3+P4) | ۱ ساعت | متوسط |
| 4 | Compare thumbnail (P5) | ۳۰ دقیقه | UX |

---

## یادداشت‌های فنی

- Analytics endpoint باید `session check` نداشته باشد (public page)
- Backfill script را با `--dry-run` flag بساز تا قبل از اجرا preview داشته باشیم
- Placeholder hash detection: `from hashlib import md5; md5(open(f,'rb').read()).hexdigest()`
- `can_skip` fix: `if uid in previous_ids and has_image and prev_record_has_images:`
