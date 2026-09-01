#!/usr/bin/env python3
"""
Re-geocode cache entries using Neshan V6.

Run from the project root:
    export NESHAN_API_KEY="service.xxx.yyy"
    python scraper/regeocode_cache.py

What it does:
  1. Reads geocode_cache.json
  2. Looks up each address in raw_latest.json to find its city
  3. Re-sends to Neshan v6/geocoding
  4. Updates geocode_cache.json and billboards.json with fixed coords
  5. Does NOT touch address / location / region / name — only lat/lng
"""

import json, math, os, time, random
from pathlib import Path

try:
    import requests
except ImportError:
    raise SystemExit("pip install requests")

# ── Paths ────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
DATA_DIR   = BASE_DIR / "data"
CACHE_FILE = DATA_DIR / "geocode_cache.json"
BILLS_FILE = DATA_DIR / "billboards.json"
RAW_FILE   = DATA_DIR / "raw_latest.json"

# ── Neshan endpoints ─────────────────────────────────────────────
NESHAN_V6 = "https://api.neshan.org/v6/geocoding"   # primary
NESHAN_V5 = "https://api.neshan.org/v5/geocoding"   # emergency fallback

# Load API key from .env.local
_env = Path(__file__).parent.parent / ".env.local"
if _env.exists():
    for _l in _env.read_text(encoding="utf-8").splitlines():
        _l = _l.strip()
        if _l and not _l.startswith("#") and "=" in _l:
            _k, _, _v = _l.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip().strip(chr(34) + chr(39)))

API_KEY = os.environ.get("NESHAN_API_KEY", "")
TIMEOUT = 6

# ── City centers ─────────────────────────────────────────────────
CITY_CENTERS: dict[str, tuple[float, float]] = {
    "تهران":      (35.6892, 51.3890),
    "کرج":        (35.8400, 50.9391),
    "اصفهان":     (32.6539, 51.6660),
    "مشهد":       (36.2972, 59.6067),
    "شیراز":      (29.5917, 52.5836),
    "تبریز":      (38.0800, 46.2919),
    "اهواز":      (31.3183, 48.6706),
    "قم":         (34.6416, 50.8746),
    "کرمانشاه":   (34.3142, 47.0650),
    "رشت":        (37.2809, 49.5832),
    "زنجان":      (36.6736, 48.4787),
    "یزد":        (31.8974, 54.3569),
    "ارومیه":     (37.5527, 45.0761),
    "کرمان":      (30.2839, 57.0834),
    "همدان":      (34.7990, 48.5147),
    "اراک":       (34.0954, 49.7092),
    "بندرعباس":   (27.1832, 56.2666),
    "ساری":       (36.5633, 53.0601),
    "قزوین":      (36.2688, 50.0041),
    "سنندج":      (35.3219, 46.9861),
    "اردبیل":     (38.2498, 48.2933),
    "گرگان":      (36.8428, 54.4439),
    "خرم‌آباد":   (33.4878, 48.3558),
    "خرم آباد":   (33.4878, 48.3558),
    "زاهدان":     (29.4963, 60.8629),
    "بوشهر":      (28.9684, 50.8385),
    "سمنان":      (35.5729, 53.3970),
    "یاسوج":      (30.6682, 51.5879),
    "ایلام":      (33.6374, 46.4227),
    "بیرجند":     (32.8663, 59.2211),
    "شهرکرد":     (32.3256, 50.8644),
    "بجنورد":     (37.4747, 57.3290),
    "مهریز":      (31.5703, 54.4258),
    "رامسر":      (36.9022, 50.6572),
}
MAX_KM = 150

def dist_km(lat1, lng1, lat2, lng2):
    dlat = (lat1 - lat2) * 111.0
    dlng = (lng1 - lng2) * 111.0 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.sqrt(dlat**2 + dlng**2)

def plausible(lat, lng, city):
    c = CITY_CENTERS.get(city)
    if not c:
        return True
    return dist_km(lat, lng, c[0], c[1]) < MAX_KM

def neshan_geocode(address: str, city: str) -> tuple[float, float] | None:
    """Try v6, fall back to v5 if unreachable."""
    full = f"{address}، {city}" if city else address
    clat, clng = CITY_CENTERS.get(city, (35.6892, 51.389))

    endpoints = [
        (NESHAN_V6, {"address": full}),
        (NESHAN_V5, {"address": full, "lat": str(clat), "lng": str(clng)}),
    ]
    for url, params in endpoints:
        try:
            r = requests.get(url, params=params, headers={"Api-Key": API_KEY}, timeout=TIMEOUT)
            if r.status_code == 200:
                data = r.json()
                if not hasattr(neshan_geocode, "_printed"):
                    label = "v6" if url == NESHAN_V6 else "v5"
                    print(f"    🔍 sample response ({label}): {str(data)[:200]}")
                    neshan_geocode._printed = True
                loc = data.get("location", {})
                lat = loc.get("y") or loc.get("lat")
                lng = loc.get("x") or loc.get("lng")
                if lat and lng:
                    return float(lat), float(lng)
        except Exception as e:
            if url == NESHAN_V6:
                print(f"    ⚠ v6 unreachable, falling back to v5...")
                continue
            print(f"    ⚠ v5 error: {e}")
    return None

# ── Load data ────────────────────────────────────────────────────
if not API_KEY:
    raise SystemExit("❌  NESHAN_API_KEY not set.\n   export NESHAN_API_KEY=\"service.xxx.yyy\"")

cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}
bills = json.loads(BILLS_FILE.read_text(encoding="utf-8")) if BILLS_FILE.exists() else []
raw   = json.loads(RAW_FILE.read_text(encoding="utf-8"))   if RAW_FILE.exists()   else []

# Build address → city map from raw_latest.json
addr_to_city: dict[str, str] = {}
for r in raw:
    loc  = (r.get("location") or "").strip()
    city = (r.get("city") or "").strip()
    if loc and city:
        addr_to_city[loc] = city

print(f"📍 Loaded {len(cache)} cache entries, {len(bills)} billboards, {len(addr_to_city)} address→city mappings")

# ── Re-geocode all cached entries ────────────────────────────────
to_fix = [(addr, coords) for addr, coords in cache.items() if coords is not None]

print(f"📍 Re-geocoding {len(to_fix)} entries with v6/geocoding\n")

fixed = 0
failed = 0

for i, (addr, old_coords) in enumerate(to_fix, 1):
    city = addr_to_city.get(addr.strip(), "")
    if not city:
        city = next((c for c in CITY_CENTERS if c in addr), "")

    print(f"  [{i}/{len(to_fix)}] {addr[:55]} ({city or '?'})")

    result = neshan_geocode(addr, city)
    time.sleep(random.uniform(0.8, 1.6))

    if result:
        lat, lng = result
        old_lat = old_coords["lat"] if old_coords else None
        old_lng = old_coords["lng"] if old_coords else None
        changed = old_lat is None or abs(lat - old_lat) > 0.0001 or abs(lng - old_lng) > 0.0001
        cache[addr] = {"lat": lat, "lng": lng}
        if changed:
            print(f"    ✓ updated: {old_lat:.5f},{old_lng:.5f} → {lat:.5f},{lng:.5f}")
        else:
            print(f"    = same:    {lat:.5f},{lng:.5f}")
        fixed += 1
    else:
        print(f"    ✗ no result — keeping old coords")
        failed += 1

# ── Apply to billboards.json (only lat/lng — nothing else touched) ──
bills_fixed = 0
for b in bills:
    addr = (b.get("location") or "").strip()
    coords = cache.get(addr)
    if coords:
        if b.get("lat") != coords["lat"] or b.get("lng") != coords["lng"]:
            b["lat"] = coords["lat"]
            b["lng"] = coords["lng"]
            bills_fixed += 1

# ── Save ─────────────────────────────────────────────────────────
CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
BILLS_FILE.write_text(json.dumps(bills, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"\n✅ Done.")
print(f"   Re-geocoded: {fixed} updated, {failed} failed")
print(f"   billboards.json: {bills_fixed} coords updated")