# Rasamap Scraper

Collects billboard listings from live Iranian websites and saves them to
`scraper/data/billboards.json`, which is seeded into the SQLite DB.

---

## Sources — وضعیت فعلی

| سایت | وضعیت | GPS | تعداد (آخرین run) | نکات |
|------|--------|-----|-------------------|------|
| **billboardiha.com** | ✅ فعال | ✅ ~99% | ~6254 | بزرگ‌ترین منبع — GPS از detail pages |
| **irbillboard.com** | ✅ فعال | ✅ ~99% | ~201 | GPS از JSON-LD/data-lat |
| **aradholding.com** | ✅ فعال | ⚠ فقط ساری | ~793 | GPS از Google Maps links — goo.gl links در ایران block است |
| **divar.ir** | ❌ بلاک | ❌ | 0 | API v8 بلاک می‌کنه، response خالی |
| **sheypoor.com** | ❌ بلاک | ❌ | 0 | ساختار HTML تغییر کرده |

**آمار کل آخرین run:** 7249 آگهیِ خام — پس از حذفِ تکراری‌ها بین منابع، `data/billboards.json` **3528 رسانه** دارد که 3032 تا مختصات دارند (۸۶٪).

---

## اجرا

```bash
# مطمئن شو VPN خاموشه (سایت‌های ایرانی + Neshan API)
cd scraper
pip install requests beautifulsoup4
python3 scraper.py
```

بعد از اتمام scraper:
```bash
cd ..
npm run db:sync-scraped             # دیتابیسِ زنده: اول dry run، گزارش را بخوان
npm run db:sync-scraped -- --apply  # ادغامِ سه‌طرفه؛ ویرایشِ ادمین هرگز بازنویسی نمی‌شود (§33)
# یا فقط روی دیتابیسِ خالی:  npm run db:seed   (بازسازیِ کامل)
```

---

## فایل‌های داده

| فایل | محتوا | توضیح |
|------|--------|-------|
| `data/checkpoint_raw.json` | آرایه JSON | داده خام همه scrapeها — بین sourceها ادغام شده |
| `data/billboards.json` | آرایه JSON | خروجی نهایی بعد از dedup + geocode + format — این فایل DB seed می‌کنه |
| `data/geocode_cache.json` | dict JSON | cache نشان geocoding — کلید: آدرس، مقدار: {lat, lng} یا null |
| `data/scrape_state.json` | dict JSON | آخرین وضعیت scrape هر source (برای incremental) |
| `data/unresolved-coords.csv` | CSV | آیتم‌های بدون GPS — برای geocode دستی |

**مهم:** `geocode_cache.json` را حذف نکن — تمام geocodeهای موفق قبلی اینجاست و در run بعدی استفاده می‌شه.

---

## pipeline داده

```
scraper.py
  ├── scraper_billboardiha.py  →  6254 listings + GPS از detail pages
  ├── scraper_aradholding.py   →  793 listings (GPS از goo.gl redirect — در ایران block)
  └── irbillboard inline       →  201 listings + GPS
          ↓
  cross_source_dedup()         →  حذف تکراری‌ها (MD5 image + address similarity)
          ↓
  geocode_missing_coords()     →  Neshan API v4 (VPN خاموش)
          ↓
  to_rasamap_format()          →  تبدیل به فرمت DB
          ↓
  billboards.json
          ↓
  npm run db:sync-scraped       →  SQLite via Prisma (یا db:seed روی دیتابیسِ خالی)
          ↓
  npm run db:backfill-coords    →  geocode اضافی از DB (NESHAN_API_KEY)
```

---

## Geocoding — نشان API

- **Endpoint:** `https://api.neshan.org/v4/geocoding`
- **Auth:** header `Api-Key: service.xxx` از `NESHAN_API_KEY` env var
- **Bias:** lat/lng مرکز شهر برای نتایج دقیق‌تر
- **Validation:** coords باید در شعاع 60km از مرکز شهر باشن
- **Cache:** `geocode_cache.json` — هر run جدید از cache می‌خونه
- **VPN:** حتماً خاموش باشه — نشان سرویس ایرانی است

---

## مشکلات شناخته‌شده و راه‌حل‌ها

### Billboardiha — Brotli encoding
**مشکل:** سایت content‌رو با Brotli compress می‌کرد، `requests` بدون decompress برمی‌گشت.  
**رفع:** حذف `br` از `Accept-Encoding` در `_stealth_headers()` — الان فقط `gzip, deflate`.

### aradholding — کد جدول بجای آدرس
**مشکل:** ستون اول جدول کد بیلبورد است (مثل `Tb-01`, `Ts-38`)، نه آدرس. scraper ستون ۰ رو می‌خوند.  
**رفع:** `is_serial()` تشخیص می‌ده که ستون ۰ ASCII alphanumeric code هست → `loc_col = 1`.  
**وضعیت:** تبریز/مشهد/همدان خوب geocode می‌شن. تهران (اتوبان تهران-ساوه page) هنوز کد برمی‌گردونه.

### aradholding — goo.gl GPS
**مشکل:** لینک‌های Google Maps روی بیشتر صفحات `goo.gl` short URL هستن. redirect‌شون به Google نیاز داره که در ایران block است.  
**وضعیت:** فقط ساری (17 billboard) که full URL داشت GPS داره. بقیه بدون GPS هستن.  
**اگه VPN داری:** با VPN روشن می‌تونی scraper رو run کنی تا redirect بخونه — ولی اون‌موقع aradholding.com خودش ممکنه block بشه.

### Divar.ir
**مشکل:** API v8 برای requests غیر‌browser خالی برمی‌گردونه. پیچیده‌ترین anti-bot در ایران.  
**وضعیت:** scraper graceful skip می‌کنه (crash نمی‌کنه).

### to_rasamap_format — hex ID
**مشکل:** `int(raw["id"][:8], 16)` crash می‌کرد برای IDs با prefix مثل `bih-29f0a1b2`.  
**رفع:** `re.search(r'[0-9a-f]{8,}', raw["id"].lower())` — اول run از hex chars رو پیدا می‌کنه.

---

## Stealth (ضد‌شناسایی)

- **UA pool:** 8 UA واقعی browser (Chrome/Firefox/Safari/Edge)
- **Accept-Encoding:** `gzip, deflate` — بدون `br` چون requests Brotli decode نمی‌کنه
- **Delays:** Gaussian jitter (2-5s بین requests) + 10% شانس pause 3-8s
- **Session warmup:** برای هر site، homepage اول fetch می‌شه تا cookies/fingerprint بگیره
- **fetch_with_retry:** backoff نمایی برای HTTP 429/502/503/504

---

## آماده‌سازی برای ارائه

1. آخرین scrape: `cd scraper && python3 scraper.py`
2. ورود به DB: `npm run db:sync-scraped -- --apply` (یا `npm run db:seed` روی دیتابیسِ خالی)
3. Geocode باقی‌مانده‌ها از DB: `npm run db:backfill-coords`
4. دیدن: `npm run demo` — نه `npm run dev` (۹۷ برابر CPU، §22)

**نکته ارائه:** ۷۲۴۹ آگهیِ خام از ۳ سایت واقعی ایرانی جمع شد؛ پس از حذفِ تکراری‌ها ۳۵۲۸ رسانه ماند که ۳۰۳۲ تا روی نقشه‌اند. billboardiha.com بزرگ‌ترین منبع است.
