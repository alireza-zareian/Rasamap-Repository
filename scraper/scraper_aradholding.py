#!/usr/bin/env python3
"""
Aradholding.com scraper — Rasamap
===================================
Site type: WordPress/Elementor — server-side HTML, no JS rendering needed.

Key advantage: each billboard row in the table links to Google Maps with REAL
GPS coordinates (@lat,lng,Nz format). Far more accurate than Neshan geocoding.

Table structure (confirmed on Isfahan + Tabriz pages):
  ردیف | موقعیت مکانی بیلبورد | متراژ | تصویر | موقعیت روی نقشه (Google Maps link)

Anti-bot: standard WordPress. robots.txt only disallows /wp-admin/ — listing
pages are explicitly allowed. Polite 1.5–3s delay between pages.

Usage:
  Called from scraper.py via scrape_aradholding(existing_files)
  Or standalone: python scraper_aradholding.py
"""

import json
import os
import re
import time
import random
import hashlib
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote

from image_utils import existing_variant, save_optimized

try:
    import requests
    from bs4 import BeautifulSoup
    HAS_BS = True
except ImportError:
    HAS_BS = False
    print("WARNING: pip install requests beautifulsoup4")

BASE_URL = "https://aradholding.com"

# City pages discovered from sitemap. Skipped:
#   - /اجاره-بیلبورد-در-هرات/ → Herat is Afghanistan, not Iran
#   - English-slug duplicates (isfahan-billboards, billboard-advertising-in-*) of same pages
#   - /بیلبورد-در-شیراز/ → marketing page without table, dup of shiraz-2
CITY_PAGES = [
    ("/قیمت-و-اجاره-بیلبورد-در-تبریز/",             "تبریز"),
    ("/قیمت-و-اجاره-بیلبورد-در-اصفهان/",            "اصفهان"),
    ("/قیمت-و-اجاره-بیلبورد-در-مشهد/",              "مشهد"),
    ("/قیمت-و-اجاره-بیلبورد-در-اهواز/",             "اهواز"),
    ("/قیمت-و-اجاره-بیلبورد-در-ارومیه/",            "ارومیه"),
    ("/قیمت-و-اجاره-بیلبورد-در-یزد/",               "یزد"),
    ("/قیمت-و-اجاره-بیلبورد-در-همدان/",             "همدان"),
    ("/قیمت-و-اجاره-بیلبورد-در-کرمان/",             "کرمان"),
    ("/قیمت-و-اجاره-بیلبورد-در-گیلان/",             "رشت"),
    ("/قیمت-و-اجاره-بیلبورد-در-مازندران/",          "ساری"),
    ("/تابلو-بیلبورد-تبلیغات-جزیره-کیش/",           "کیش"),
    ("/قیمت-و-اجاره-بیلبورد-اتوبان-کرج-قزوین/",    "کرج"),
    ("/قیمت-و-اجاره-بیلبورد-اتوبان-تهران-ساوه/",   "تهران"),
    ("/billboard-advertising-in-shiraz-2/",           "شیراز"),
]

SLEEP_MIN = 2.0
SLEEP_MAX = 5.0

# Reuse stealth + resilience helpers from the main scraper module. Imported
# here (function-call time via scraper.py's own import order — see the
# "Per-site scraper module imports" comment in scraper.py) so this succeeds
# whenever the pipeline runs through scraper.py, and falls back gracefully
# when this file is run standalone before that.
try:
    from scraper import (
        _stealth_headers,
        make_stealth_session,
        fetch_with_retry as _fetch_with_retry,
        looks_like_challenge_page as _looks_like_challenge_page,
        polite_sleep as _polite_sleep,
        extract_phone,
    )
    _USE_STEALTH = True
except ImportError:
    _USE_STEALTH = False
    def extract_phone(text: str) -> str:  # type: ignore[misc]
        import re as _re
        fa = "۰۱۲۳۴۵۶۷۸۹"
        for i, c in enumerate(fa):
            text = text.replace(c, str(i))
        m = _re.search(r'09[0-9]{2}[-\s]?[0-9]{3}[-\s]?[0-9]{4}', text)
        return _re.sub(r'[-\s]', '', m.group()) if m else ""

def _get_session() -> "requests.Session":
    if _USE_STEALTH:
        return make_stealth_session(BASE_URL)
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": BASE_URL + "/",
    })
    return s

def _fetch(session: "requests.Session", url: str, timeout: float = 15, max_retries: int = 3, **kwargs):
    if _USE_STEALTH:
        return _fetch_with_retry(session, "GET", url, timeout=timeout, max_retries=max_retries, **kwargs)
    return session.get(url, timeout=timeout, **kwargs)

def _is_challenge(html: str) -> bool:
    return _looks_like_challenge_page(html) if _USE_STEALTH else False

def _sleep():
    if _USE_STEALTH:
        _polite_sleep(SLEEP_MIN, SLEEP_MAX)
    else:
        time.sleep(random.uniform(SLEEP_MIN, SLEEP_MAX))

IMAGE_DIR = Path(__file__).parent.parent / "public" / "images" / "scraped"
IMAGE_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_WEB_PREFIX = "/images/scraped"

# ── Helpers ───────────────────────────────────────────────────────

def make_id(text: str) -> str:
    return "arad-" + hashlib.md5(text.encode()).hexdigest()[:8]


def extract_gmaps_coords(url: str) -> tuple[float, float] | None:
    """
    Extract GPS coordinates from a Google Maps URL.
    Handles:
      - https://maps.google.com/?q=lat,lng
      - https://www.google.com/maps/place/.../@lat,lng,Nz
      - https://goo.gl/maps/... (short links — cannot resolve without HTTP GET)
    """
    # @lat,lng,Nz — most common format from aradholding map links
    m = re.search(r"@([\d.\-]+),([\d.\-]+),\d+(?:\.\d+)?z", url)
    if m:
        lat, lng = float(m.group(1)), float(m.group(2))
        if 24.0 < lat < 40.0 and 44.0 < lng < 64.0:
            return lat, lng

    # ?q=lat,lng or ?q=lat%2Clng
    m = re.search(r"[?&]q=([\d.\-]+)[,%2C]+([\d.\-]+)", url)
    if m:
        lat, lng = float(m.group(1)), float(m.group(2))
        if 24.0 < lat < 40.0 and 44.0 < lng < 64.0:
            return lat, lng

    # ll=lat,lng
    m = re.search(r"[?&]ll=([\d.\-]+),([\d.\-]+)", url)
    if m:
        lat, lng = float(m.group(1)), float(m.group(2))
        if 24.0 < lat < 40.0 and 44.0 < lng < 64.0:
            return lat, lng

    return None


def download_image(
    url: str, listing_id: str, existing_files: set[str], session: "requests.Session"
) -> list[str]:
    if not url:
        return []
    try:
        stem = f"{listing_id}_0"
        have = existing_variant(existing_files, stem)
        if have:  # already downloaded on a previous run, any extension
            return [f"{IMAGE_WEB_PREFIX}/{have}"]
        ext = os.path.splitext(url.split("?")[0].rstrip("/"))[-1] or ".jpg"
        if ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
            ext = ".jpg"
        resp = _fetch(session, url, timeout=10, max_retries=2, stream=True)
        resp.raise_for_status()
        data = b"".join(resp.iter_content(8192))
        fname = save_optimized(data, IMAGE_DIR / f"{stem}{ext}")  # opaque PNG -> JPEG
        existing_files.add(fname)
        time.sleep(random.uniform(0.3, 0.7))
        return [f"{IMAGE_WEB_PREFIX}/{fname}"]
    except Exception:
        return []


def parse_dimensions(text: str) -> tuple[float | None, float | None]:
    """
    Parse billboard dimensions from text like '6.8×15.2', '37.5 m²', '48'.
    Returns (width, height) or (None, None).
    """
    # Width×Height format
    m = re.search(r"([\d.]+)\s*[×xX*]\s*([\d.]+)", text)
    if m:
        return float(m.group(1)), float(m.group(2))
    # Single number (area in m²) — approximate as 4:1 billboard aspect
    m = re.search(r"([\d.]+)", text)
    if m:
        area = float(m.group(1))
        if 1 < area < 2000:
            # Common billboard aspect ratio: 4:1
            h = round((area / 4) ** 0.5, 1)
            w = round(area / max(h, 0.1), 1)
            return w, h
    return None, None


# ── Per-city page scraper ─────────────────────────────────────────

def scrape_city_page(
    session: "requests.Session",
    url_path: str,
    city: str,
    existing_files: set[str],
) -> list[dict]:
    url = BASE_URL + url_path
    results: list[dict] = []

    try:
        resp = _fetch(session, url, timeout=15, max_retries=3)
        if resp.status_code != 200:
            print(f"  [arad] {city}: HTTP {resp.status_code} — skipping")
            return []

        if _is_challenge(resp.text):
            print(f"  [arad] {city}: challenge/WAF page detected — skipping (not a code bug)")
            return []

        soup = BeautifulSoup(resp.text, "html.parser")
        # Extract company-level phone from this page (same for all records on this city page)
        page_phone = extract_phone(soup.get_text(" ", strip=True))

        # Find ALL tables, pick the one with the most rows (the listing table)
        tables = soup.find_all("table")
        if not tables:
            print(f"  [arad] {city}: no <table> found — page may be article-only")
            return []

        main_table = max(tables, key=lambda t: len(t.find_all("tr")))
        rows = main_table.find_all("tr")

        # Detect header row: skip rows where all cells are <th> or first cell is "#" / "ردیف"
        data_rows = []
        for row in rows:
            cells = row.find_all(["td", "th"])
            if not cells:
                continue
            first_text = cells[0].get_text(strip=True)
            # Skip header rows
            if first_text in ("#", "ردیف", "Row", "") or row.find("th"):
                continue
            # Skip rows with fewer than 2 meaningful cells
            non_empty = [c for c in cells if c.get_text(strip=True)]
            if len(non_empty) < 2:
                continue
            data_rows.append(row)

        for row in data_rows:
            cells = row.find_all(["td", "th"])

            # ── Location (column 1, after optional row-number/code column) ──
            # Detect if column 0 is a serial identifier rather than a real address.
            # Codes like "Tb-01", "Ma-03", "kar-qaz-01" are billboard IDs — skip to col 1.
            col0_text = cells[0].get_text(strip=True) if cells else ""
            is_serial = (
                re.fullmatch(r"\d+", col0_text)  # pure number: "1", "42"
                or (
                    re.fullmatch(r"[A-Za-z0-9\-_]{1,20}", col0_text)  # ASCII code
                    and bool(re.search(r"\d", col0_text))              # contains a digit
                    and not bool(re.search(r"[؀-ۿ]", col0_text))  # no Persian
                )
            )
            loc_col = 1 if is_serial and len(cells) > 1 else 0
            location = cells[loc_col].get_text(separator=" ", strip=True) if len(cells) > loc_col else ""
            if not location or len(location) < 4:
                continue

            # ── Dimensions (look for a cell with × or a numeric value) ──
            width = height = None
            for c in cells[loc_col + 1:]:
                text = c.get_text(strip=True)
                w, h = parse_dimensions(text)
                if w:
                    width, height = w, h
                    break

            # ── Image ──
            img_url = None
            for c in cells:
                img = c.find("img")
                if img:
                    src = img.get("data-src") or img.get("src") or ""
                    if src and not src.startswith("data:") and ("wp-content" in src or src.startswith("http")):
                        img_url = src if src.startswith("http") else BASE_URL + src
                    break

            # ── GPS from Google Maps link ──
            lat = lng = None
            for a in row.find_all("a", href=True):
                href = a["href"]
                if "google.com/maps" in href or "goo.gl" in href or "maps.app.goo" in href:
                    coords = extract_gmaps_coords(href)
                    if not coords and ("goo.gl" in href or "maps.app.goo" in href):
                        # Short URL — follow the redirect to get the full Google Maps URL
                        try:
                            r = session.head(href, allow_redirects=True, timeout=8)
                            coords = extract_gmaps_coords(r.url)
                        except Exception:
                            pass
                    if coords:
                        lat, lng = coords
                        break

            # ── Build record ──
            listing_id = make_id(f"arad-{city}-{location}")
            images = download_image(img_url, listing_id, existing_files, session) if img_url else []

            record: dict = {
                "id": listing_id,
                "source": "aradholding",
                "name": f"بیلبورد {location[:65]}",
                "location": location,
                "region": location,
                "city": city,
                "type": "billboard",
                "status": "available",
                # No price on site — estimate based on city, type, and size
                "price": _city_price_estimate(city, "billboard", width or 6.0, height or 4.0),
                "phone": page_phone,
                "agency": "آراد هولدینگ",
                "traffic": _estimate_traffic(location, city, "billboard", width or 6.0, height or 4.0),
                "images": images,
                "scrapedAt": datetime.now().isoformat(),
            }
            if width:
                record["_widthRaw"] = width
            if height:
                record["_heightRaw"] = height
            if lat is not None and lng is not None:
                record["lat"] = lat
                record["lng"] = lng

            results.append(record)

    except Exception as e:
        print(f"  [arad] {city}: exception — {e}")

    return results


try:
    from traffic_formula import estimate_traffic as _tf_traffic, estimate_price as _tf_price
    _HAS_FORMULA = True
except ImportError:
    _HAS_FORMULA = False

def _city_price_estimate(city: str, board_type: str = "billboard", width: float = 6.0, height: float = 4.0) -> int:
    if _HAS_FORMULA:
        return _tf_price(city, board_type, width, height)
    fallback = {"تهران": 350, "کرج": 200, "اصفهان": 220, "مشهد": 210,
                "شیراز": 180, "تبریز": 190, "کیش": 260}
    return fallback.get(city, 120) + random.randint(-20, 40)

def _estimate_traffic(location: str, city: str, board_type: str = "billboard", width: float = 6.0, height: float = 4.0) -> dict:
    if _HAS_FORMULA:
        return _tf_traffic(city, location, board_type, width, height)
    daily = {"تهران": 300000, "اصفهان": 180000, "مشهد": 200000}.get(city, 120000)
    return {
        "daily": daily, "peakHour": "08:00-09:00",
        "congestionLevel": min(10, max(3, daily // 50000)),
        "pedestrian": int(daily * 0.07),
        "estimatedViews": int(daily * 1.3 * 0.35),
        "viewabilityScore": min(100, 40 + min(10, daily // 50000) * 5),
    }


# ── Main entry point ──────────────────────────────────────────────

def scrape_aradholding(existing_files: set[str] | None = None) -> list[dict]:
    if not HAS_BS:
        return []

    if existing_files is None:
        existing_files = {f.name for f in IMAGE_DIR.iterdir() if f.is_file()}

    print("\n--- aradholding.com scraper starting ---")
    print(f"    {len(CITY_PAGES)} city pages — GPS coordinates from Google Maps links")

    session = _get_session()

    all_results: list[dict] = []
    coord_count = 0

    for url_path, city in CITY_PAGES:
        results = scrape_city_page(session, url_path, city, existing_files)
        new_coords = sum(1 for r in results if r.get("lat"))
        coord_count += new_coords
        print(f"  [arad] {city}: {len(results)} billboards ({new_coords} with GPS)")
        all_results.extend(results)
        _sleep()

    print(f"--- aradholding done: {len(all_results)} listings, {coord_count} with real GPS ---")
    return all_results


if __name__ == "__main__":
    data = scrape_aradholding()
    with_coords = [d for d in data if d.get("lat")]
    print(f"\nTotal: {len(data)}  |  With GPS: {len(with_coords)}")
    if data:
        print(json.dumps(data[0], ensure_ascii=False, indent=2))
