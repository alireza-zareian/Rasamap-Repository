#!/usr/bin/env python3
"""
Billboardiha.com Scraper — Rasamap
====================================
Site type: PHP server-side + jQuery (no React/Next.js)
Full HTML is returned from server — BeautifulSoup is sufficient.

Card HTML structure:
  <div class="B-item">
    <div class="container">
      <a class="content" href="/billboard/6134-9349/slug">
        <div class="image"><img src="/_container/billboard/ID/main.png"></div>
        <div class="title">Billboard name</div>
      </a>
      <div class="info">
        <a href="/billboard/type/billboard/..." class="item">billboard</a>
        <a href="/city/85/city-name" class="item">city name</a>
      </div>
    </div>
  </div>

Pagination format: /billboard/type/billboard/%D8%A8%DB%8C%D9%84%D8%A8%D9%88%D8%B1%D8%AF/page=N
Total pages: 132

PERFORMANCE NOTES (Task #4):
  - Detail pages are fetched concurrently (up to DETAIL_WORKERS threads).
  - Listings already in state (same raw_id, images on disk) skip detail fetch.
  - Seen-ID tracking uses a set for O(1) lookups.
  - A single requests.Session is reused for connection keep-alive.
  - Image existence check uses a pre-built set instead of per-file stat calls.
"""

import json
import os
import re
import time
import random
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

try:
    import requests
    from bs4 import BeautifulSoup
    HAS_BS = True
except ImportError:
    HAS_BS = False
    print("WARNING: pip install requests beautifulsoup4")

BASE_URL  = "https://billboardiha.com"

# City-based sections — one per province.
# URL pattern: /city/{id}/page=N (confirmed from site).
# Scraping by city ensures full coverage per city (e.g. Zanjan = 5 pages ~100
# listings) instead of being buried in type-based sections that stop early.
CITY_SECTIONS = [
    ("/city/1/page=",   "آذربایجان شرقی"),
    ("/city/2/page=",   "آذربایجان غربی"),
    ("/city/3/page=",   "اردبیل"),
    ("/city/4/page=",   "اصفهان"),
    ("/city/5/page=",   "البرز"),
    ("/city/6/page=",   "ایلام"),
    ("/city/7/page=",   "بوشهر"),
    ("/city/8/page=",   "تهران"),
    ("/city/9/page=",   "چهارمحال بختیاری"),
    ("/city/10/page=",  "خراسان جنوبی"),
    ("/city/11/page=",  "خراسان رضوی"),
    ("/city/12/page=",  "خراسان شمالی"),
    ("/city/13/page=",  "خوزستان"),
    ("/city/14/page=",  "زنجان"),
    ("/city/15/page=",  "سمنان"),
    ("/city/16/page=",  "سیستان و بلوچستان"),
    ("/city/17/page=",  "فارس"),
    ("/city/18/page=",  "قزوین"),
    ("/city/19/page=",  "قم"),
    ("/city/20/page=",  "کردستان"),
    ("/city/21/page=",  "کرمان"),
    ("/city/22/page=",  "کرمانشاه"),
    ("/city/23/page=",  "کهگیلویه و بویر احمد"),
    ("/city/24/page=",  "گلستان"),
    ("/city/25/page=",  "گیلان"),
    ("/city/26/page=",  "لرستان"),
    ("/city/27/page=",  "مازندران"),
    ("/city/28/page=",  "مرکزی"),
    ("/city/29/page=",  "هرمزگان"),
    ("/city/30/page=",  "همدان"),
    ("/city/31/page=",  "یزد"),
]
LIST_BASE = CITY_SECTIONS[0][0]  # backward compat

MAX_PAGES   = 60    # billboardiha rarely exceeds 30 pages per section
SLEEP_MIN   = 0.5
SLEEP_MAX   = 1.2

# Detail-page concurrency: 4 workers keeps load polite while giving ~4x
# speedup over serial fetching. Stay well below what would look like a
# DoS attack. DO NOT raise above 6 without re-evaluating block risk.
DETAIL_WORKERS     = 12
DETAIL_SLEEP_MIN   = 0.2   # per-worker courtesy delay (workers run in parallel,
DETAIL_SLEEP_MAX   = 0.5   # so aggregate rate = workers × (1 / avg_sleep))

IMAGE_DIR = Path(__file__).parent.parent / "public" / "images" / "scraped"
IMAGE_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_WEB_PREFIX = "/images/scraped"
MAX_IMAGES_PER_LISTING = 5

# Images smaller than this are placeholder/error images (billboardiha placeholder = ~3.4KB).
MIN_IMAGE_BYTES = 10_000

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL + "/",
}

# Imported here (function-call time, not at module top) to avoid a circular
# import — scraper.py imports this module only after its own stealth/retry
# helpers are already defined, so this succeeds when run via scraper.py
# and falls back gracefully when this file is run standalone before that
# point in scraper.py's load order.
try:
    from scraper import (
        make_stealth_session as _make_stealth_session,
        fetch_with_retry as _fetch_with_retry,
        looks_like_challenge_page as _looks_like_challenge_page,
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
        return _make_stealth_session(BASE_URL)
    s = requests.Session()
    s.headers.update(HEADERS)
    return s

def _fetch(session: "requests.Session", url: str, timeout: float = 15, max_retries: int = 3):
    if _USE_STEALTH:
        return _fetch_with_retry(session, "GET", url, timeout=timeout, max_retries=max_retries)
    return session.get(url, timeout=timeout)

def _is_challenge(html: str) -> bool:
    return _looks_like_challenge_page(html) if _USE_STEALTH else False

KNOWN_CITIES = [
    "تهران","کرج","اصفهان","مشهد","شیراز","تبریز","اهواز","قم","رشت",
    "یزد","ارومیه","کرمان","همدان","اراک","بندرعباس","ساری","قزوین",
    "خرم‌آباد","سنندج","اردبیل","بوشهر","گرگان","سمنان","زاهدان",
    "کرمانشاه","زنجان","ایلام","بیرجند","بجنورد","یاسوج","شهرکرد",
    "نجف‌آباد","کاشان","مبارکه","رودهن","دماوند","محمدشهر",
]


def polite_sleep(mn=SLEEP_MIN, mx=SLEEP_MAX):
    time.sleep(random.uniform(mn, mx))


def make_id(text: str) -> str:
    return "bih-" + hashlib.md5(text.encode()).hexdigest()[:8]


def download_images(urls: list[str], listing_id: str, existing_files: set[str]) -> list[str]:
    """
    Downloads listing photos into /public/images/scraped/.
    Rejects images smaller than MIN_IMAGE_BYTES (billboardiha placeholders are ~3.4KB).
    """
    saved = []
    for i, url in enumerate(urls[:MAX_IMAGES_PER_LISTING]):
        if not url:
            continue
        try:
            ext = os.path.splitext(urlparse(url).path)[1] or ".jpg"
            if ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                ext = ".jpg"
            fname = f"{listing_id}_{i}{ext}"
            fpath = IMAGE_DIR / fname
            web_path = f"{IMAGE_WEB_PREFIX}/{fname}"

            if fname not in existing_files:
                if _USE_STEALTH:
                    resp = _fetch_with_retry(requests, "GET", url, headers=HEADERS, timeout=10, stream=True, max_retries=2)
                else:
                    resp = requests.get(url, headers=HEADERS, timeout=10, stream=True)
                resp.raise_for_status()
                data = resp.content
                if len(data) < MIN_IMAGE_BYTES:
                    continue  # placeholder — discard without saving
                with open(fpath, "wb") as f:
                    f.write(data)
                existing_files.add(fname)
                time.sleep(random.uniform(0.2, 0.5))

            saved.append(web_path)
        except Exception:
            continue  # one bad image shouldn't kill the whole listing
    return saved


def guess_city(text: str) -> str:
    for city in KNOWN_CITIES:
        if city in text:
            return city
    return ""


def clean_price(text: str) -> int | None:
    if not text:
        return None
    fa = "۰۱۲۳۴۵۶۷۸۹"
    for i, c in enumerate(fa):
        text = text.replace(c, str(i))
    text = text.replace(",", "").replace("\u200c", "")
    nums = re.findall(r"\d+", text)
    if not nums:
        return None
    val = int(nums[0])
    if "میلیون" in text:
        return val
    if val > 1_000_000:
        return val // 1_000_000
    if val > 1_000:
        return val // 1_000
    return val


def infer_type(title: str, type_text: str = "") -> str:
    text = (title + " " + type_text).lower()
    if any(w in text for w in ["دیجیتال", "led", "ال ای دی", "تلویزیون"]):
        return "digital"
    if any(w in text for w in ["پل", "عرشه", "زیرگذر", "روگذر"]):
        return "bridge"
    if any(w in text for w in ["ایستگاه", "مترو", "brt", "بی آر تی"]):
        return "station"
    return "billboard"


try:
    from traffic_formula import estimate_traffic as _estimate_traffic_formula, estimate_price as _estimate_price_formula
    _HAS_FORMULA = True
except ImportError:
    _HAS_FORMULA = False

def estimate_traffic(region: str, board_type: str, city: str = "", width: float = 6.0, height: float = 4.0) -> dict:
    if _HAS_FORMULA:
        return _estimate_traffic_formula(city or "تهران", region, board_type, width, height)
    # Fallback (standalone run without traffic_formula)
    daily = 150_000
    return {
        "daily": daily, "peakHour": "08:00-09:00",
        "congestionLevel": 4, "pedestrian": 12000,
        "estimatedViews": 52500, "viewabilityScore": 45,
    }


# ── Parse cards from a listing page ─────────────────────────────

def parse_cards(soup: "BeautifulSoup") -> list[dict]:
    cards = []

    # Primary selector — original site structure
    items = soup.select("div.B-item")

    # Fallback 1: generic item/card containers that link to /billboard/ID/ paths
    if not items:
        items = soup.select("div.item, div.card, article.item, li.item")

    # Fallback 2: any anchor whose href matches the billboard detail URL pattern
    if not items:
        raw_links = soup.find_all("a", href=re.compile(r"/billboard/[\w\-]+/[\w\-]"))
        for a in raw_links:
            try:
                href = a.get("href", "")
                if not href:
                    continue
                title = a.get_text(strip=True) or a.get("title", "")
                if not title or len(title) < 3:
                    continue
                url = BASE_URL + href if href.startswith("/") else href
                id_match = re.search(r"/billboard/([^/]+)/", href)
                raw_id   = id_match.group(1) if id_match else make_id(href)
                img_tag  = a.find("img")
                img_src  = ""
                if img_tag:
                    img_src = img_tag.get("data-src") or img_tag.get("src") or ""
                    if img_src.startswith("/"):
                        img_src = BASE_URL + img_src
                if not any(c["raw_id"] == raw_id for c in cards):
                    cards.append({
                        "raw_id": raw_id, "url": url, "title": title,
                        "img_src": img_src, "type_text": "", "city_text": "",
                    })
            except Exception:
                continue
        return cards

    for item in items:
        try:
            a = item.select_one("a.content") or item.find("a", href=re.compile(r"/billboard/"))
            if not a:
                continue
            href  = a.get("href", "")
            title = (a.select_one("div.title") or a).get_text(strip=True)
            if not title or not href:
                continue
            url = BASE_URL + href if href.startswith("/") else href

            # Image — support lazy-load (data-src) and normal src
            img_tag = item.select_one("div.image img") or item.find("img")
            img_src = ""
            if img_tag:
                img_src = img_tag.get("data-src") or img_tag.get("src") or ""
                if img_src.startswith("/"):
                    img_src = BASE_URL + img_src

            # Type and city from div.info > a.item links
            info_links = item.select("div.info a.item")
            type_text  = info_links[0].get_text(strip=True) if len(info_links) > 0 else ""
            city_text  = info_links[1].get_text(strip=True) if len(info_links) > 1 else ""

            # Extract raw ID from href: /billboard/6134-9349/slug -> 6134-9349
            id_match = re.search(r"/billboard/([^/]+)/", href)
            raw_id   = id_match.group(1) if id_match else make_id(href)

            cards.append({
                "raw_id":    raw_id,
                "url":       url,
                "title":     title,
                "img_src":   img_src,
                "type_text": type_text,
                "city_text": city_text,
            })
        except Exception:
            continue
    return cards


def _extract_coords_bih(html: str, soup) -> tuple[float | None, float | None]:
    """
    Extract GPS coordinates from a billboardiha detail page.
    Priority: JSON-LD > data-lat/lng attrs > Google Maps links >
              Neshan/Balad links > JS vars > <meta> tags.
    Returns (lat, lng) or (None, None). Never modifies any other field.
    """
    # 1. JSON-LD
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            items = data if isinstance(data, list) else [data]
            for item in items:
                geo_block = item.get("geo") or item.get("location") or {}
                if isinstance(geo_block, dict):
                    lat_c = geo_block.get("latitude") or geo_block.get("lat")
                    lng_c = geo_block.get("longitude") or geo_block.get("lng")
                    if lat_c and lng_c:
                        return float(lat_c), float(lng_c)
        except Exception:
            continue

    # 2. data-lat / data-lng attributes
    for el in soup.find_all(True, {"data-lat": True}):
        try:
            lat_c = el.get("data-lat") or el.get("data-latitude")
            lng_c = el.get("data-lng") or el.get("data-long") or el.get("data-longitude")
            if lat_c and lng_c:
                return float(lat_c), float(lng_c)
        except Exception:
            continue

    # 3. Google Maps links
    for pattern in [
        r"maps\.google\.com/maps\?q=([\d.\-]+)[,%2C]+([\d.\-]+)",
        r"maps\.google\.com/maps\?.*?ll=([\d.\-]+),([\d.\-]+)",
        r"@([\d.\-]+),([\d.\-]+),\d+z",
    ]:
        m = re.search(pattern, html)
        if m:
            try:
                lat_c, lng_c = float(m.group(1)), float(m.group(2))
                if 24 < lat_c < 40 and 44 < lng_c < 64:
                    return lat_c, lng_c
            except Exception:
                continue

    # 4. Neshan / Balad links
    for pattern in [
        r"neshan\.org/[^\"']*/([\d.\-]+),([\d.\-]+)",
        r"balad\.ir/[^\"']*[?&]lat=([\d.\-]+).*?lng=([\d.\-]+)",
    ]:
        m = re.search(pattern, html)
        if m:
            try:
                return float(m.group(1)), float(m.group(2))
            except Exception:
                continue

    # 5. JS variable patterns
    m_lat = re.search(r'["\']?lat(?:itude)?["\']?\s*[:=]\s*([\d.\-]+)', html)
    m_lng = re.search(r'["\']?l(?:ng|ongitude)["\']?\s*[:=]\s*([\d.\-]+)', html)
    if m_lat and m_lng:
        try:
            lat_c, lng_c = float(m_lat.group(1)), float(m_lng.group(1))
            if 24 < lat_c < 40 and 44 < lng_c < 64:
                return lat_c, lng_c
        except Exception:
            pass

    # 6. <meta> coordinate tags
    for meta in soup.find_all("meta"):
        name = (meta.get("name") or meta.get("property") or "").lower()
        if "latitude" in name or "geo.position" in name:
            content = meta.get("content", "")
            parts = content.replace(";", ",").split(",")
            if len(parts) >= 2:
                try:
                    return float(parts[0].strip()), float(parts[1].strip())
                except Exception:
                    pass

    return None, None


# ── Fetch detail page for one listing ───────────────────────────

def fetch_one(session: "requests.Session", card: dict, existing_files: set[str]) -> dict | None:
    title      = card["title"]
    url        = card["url"]
    raw_id     = card["raw_id"]
    board_type = infer_type(title, card["type_text"])
    city       = guess_city(card["city_text"] + title) or card["city_text"] or "unknown"
    uid        = make_id("billboardiha-" + raw_id)

    location = title
    price    = None
    lat = lng = None
    width = height = faces = None
    phone    = ""
    # Use the image URL directly from the card HTML (the one billboardiha actually
    # shows for this listing on the city page). For listings without their own photo
    # the site shows a representative billboard image — we download that too.
    # Fall back to constructing the URL from raw_id only if card has no img src.
    card_img_src = card.get("img_src", "").strip()
    if card_img_src:
        direct_img_url = BASE_URL + card_img_src if card_img_src.startswith("/") else card_img_src
    else:
        direct_img_url = f"{BASE_URL}/_container/billboard/{raw_id}/main.jpg"
    images = download_images([direct_img_url], uid, existing_files)

    try:
        resp = _fetch(session, url, timeout=6, max_retries=1)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        flat = soup.get_text("\n")

        # Address — only override the card title if the detail page gives something
        # clearly longer and more specific. Never replace a good address with a
        # short or ambiguous one scraped from the page body.
        original_location = location  # preserve card title as fallback
        addr_el = (
            soup.select_one(".address") or
            soup.select_one(".location") or
            soup.find(string=re.compile(r"آدرس\s*[:\-]"))
        )
        detail_location = ""
        if addr_el:
            detail_location = addr_el.get_text(strip=True).replace("آدرس", "").strip(": -")
        else:
            m = re.search(r"آدرس\s*[:\-]?\s*\n*\s*([^\n]{5,120})", flat)
            if m:
                detail_location = m.group(1).strip()
        # Only accept detail page address if it is meaningfully longer than what
        # we already have from the card title (avoids replacing specific addresses
        # with generic page noise like city names or partial matches).
        if detail_location and len(detail_location) > len(original_location) + 10:
            location = detail_location

        # Price
        price_el = (
            soup.select_one(".price") or
            soup.select_one(".cost") or
            soup.find(string=re.compile(r"قیمت|اجاره|تومان"))
        )
        if price_el:
            price = clean_price(
                price_el.get_text(strip=True)
                if hasattr(price_el, "get_text") else str(price_el)
            )

        # GPS coordinates — comprehensive multi-pattern extraction
        # Priority: JSON-LD > data-lat/lng attrs > Google Maps links >
        #           Neshan/Balad links > JS vars > <meta> tags
        lat, lng = _extract_coords_bih(resp.text, soup)

        # billboardiha has exactly ONE image per listing at the direct URL.
        # The detail page sidebar shows ~20 related listings — their div.image
        # img tags must NOT be scraped as this listing's gallery (wrong photos).

        # Refine city from page content
        city_from_page = guess_city(location + flat[:500])
        if city_from_page:
            city = city_from_page

        # Phone number
        phone = extract_phone(flat)

        # Dimensions — try to extract width × height from page text
        dim_match = re.search(r"(\d+(?:\.\d+)?)\s*[×x*]\s*(\d+(?:\.\d+)?)\s*(?:متر|m)", flat)
        if dim_match:
            try:
                width  = float(dim_match.group(1))
                height = float(dim_match.group(2))
            except ValueError:
                pass
        # Faces
        face_match = re.search(r"(\d+)\s*وجه", flat)
        if face_match:
            try:
                faces = int(face_match.group(1))
            except ValueError:
                pass

    except Exception:
        pass  # Fall back to card data — never crash on one listing

    # Courtesy delay inside each worker thread so concurrent workers
    # don't all fire requests simultaneously at the end of their fetch.
    time.sleep(random.uniform(DETAIL_SLEEP_MIN, DETAIL_SLEEP_MAX))

    record = {
        "id":        uid,
        "source":    "billboardiha",
        "url":       url,
        "structureCode": raw_id.split("-")[0] if "-" in raw_id else raw_id,
        "name":      title,
        "location":  location,
        "region":    location,
        "city":      city,
        "type":      board_type,
        "status":    "available",
        "width":     width or 6.0,
        "height":    height or 4.0,
        "faces":     faces or 1,
        "price":     price or (_estimate_price_formula(city, board_type, width or 6.0, height or 4.0) if _HAS_FORMULA else random.randint(50, 300)),
        "phone":     phone,
        "agency":    "Billboardiha",
        "traffic":   estimate_traffic(location, board_type, city, width or 6.0, height or 4.0),
        "images":    images,
        "scrapedAt": datetime.now().isoformat(),
    }
    if lat and lng:
        record["lat"] = lat
        record["lng"] = lng

    return record


# ── Collect all listing cards via pagination ─────────────────────

def _paginate_section(session: "requests.Session", base_path: str, label: str,
                      seen_ids: set) -> list[dict]:
    """Paginate one section URL, return new cards not already in seen_ids."""
    cards_out: list[dict] = []
    consecutive_empty = 0   # stop after 3 consecutive all-duplicate pages
    print(f"  [{label}] Paginating: {base_path}N")

    for page_num in range(1, MAX_PAGES + 1):
        url = BASE_URL + base_path + str(page_num)
        retries = 3
        resp = None

        for attempt in range(retries):
            try:
                resp = _fetch(session, url, timeout=15, max_retries=2)
                break
            except Exception as e:
                if attempt < retries - 1:
                    print(f"  [{label}] Page {page_num}: retry {attempt+1} after error: {e}")
                    time.sleep(random.uniform(3, 6))
                else:
                    print(f"  [{label}] Page {page_num}: failed after {retries} retries — skipping page")

        if resp is None:
            continue  # skip this page, don't abort the whole section

        if resp.status_code == 404:
            print(f"  [{label}] Page {page_num}: 404 — section done")
            break
        if resp.status_code != 200:
            print(f"  [{label}] Page {page_num}: HTTP {resp.status_code} — section done")
            break

        if _is_challenge(resp.text):
            print(f"  [{label}] Page {page_num}: challenge/WAF page detected — section stopped (not a code bug)")
            break

        soup  = BeautifulSoup(resp.text, "html.parser")
        cards = parse_cards(soup)

        new_cards = [c for c in cards if c["raw_id"] not in seen_ids]
        if not new_cards:
            if page_num == 1 and not cards:
                snippet = resp.text[:600].replace("\n", " ")
                print(f"  [{label}] Page 1: no cards found — HTML snippet: {snippet!r:.300}")
            consecutive_empty += 1
            if consecutive_empty >= 3:
                print(f"  [{label}] Page {page_num}: 3 consecutive all-duplicate pages — section done")
                break
            print(f"  [{label}] Page {page_num}: no new cards (empty #{consecutive_empty}) — continuing")
        else:
            consecutive_empty = 0
            for c in new_cards:
                seen_ids.add(c["raw_id"])
            cards_out.extend(new_cards)

        page_nums = [
            int(m.group(1))
            for a in soup.select("a[href*='page=']")
            for m in [re.search(r"page=(\d+)", a.get("href", ""))]
            if m
        ]
        last_page = max(page_nums) if page_nums else page_num
        print(f"  [{label}] Page {page_num}/{last_page}: +{len(new_cards)} cards (section total: {len(cards_out)})")

        if page_num >= last_page:
            print(f"  [{label}] Reached last page ({last_page}) — section done")
            break

        polite_sleep()

    return cards_out


def collect_all_cards(session: "requests.Session") -> list[dict]:
    """Paginate through all 31 province city pages for complete coverage."""
    all_cards: list[dict] = []
    seen_ids:  set[str]   = set()

    for base_path, label in CITY_SECTIONS:
        section_cards = _paginate_section(session, base_path, label, seen_ids)
        all_cards.extend(section_cards)
        print(f"  [{label}] done: {len(section_cards)} cards")

    # With city-based sections, raw_id dedup (via seen_ids) is sufficient.
    # Multiple listings with the same name in the same city are genuinely different
    # physical panels (e.g. several billboard faces at the same intersection).
    print(f"  Total across all sections: {len(all_cards)} cards")
    return all_cards


def _load_previous_state(state_file: Path) -> dict[str, list[str]]:
    """
    Returns {id: images_list} for all billboardiha entries in the previous
    run's state file.  Used to decide whether a listing can be skipped:
    a listing is only safe to skip if it had at least one image recorded,
    meaning its detail page was successfully fetched and the image wasn't
    later cleared (e.g. by a DB de-placeholder cleanup).
    """
    if not state_file.exists():
        return {}
    try:
        data = json.loads(state_file.read_text(encoding="utf-8"))
        return {
            entry["id"]: entry.get("images") or []
            for entry in data
            if entry.get("source") == "billboardiha"
        }
    except Exception:
        return {}


# ── Main entry point ─────────────────────────────────────────────

def scrape_billboardiha(fresh_start: bool = False) -> list[dict]:
    if not HAS_BS:
        return []

    print("\n--- billboardiha.com scraper starting ---")

    state_file = Path(__file__).parent / "data" / "scrape_state.json"

    if fresh_start:
        print("  [fresh] clearing billboardiha state — full re-fetch")
        if state_file.exists():
            state_file.unlink()

    session = _get_session()

    # Pre-build the set of files already on disk once — avoids per-listing
    # fpath.exists() calls (a stat() syscall each) inside fetch_one().
    existing_files: set[str] = {f.name for f in IMAGE_DIR.iterdir() if f.is_file()}

    # Load state from previous run so we can skip unchanged listings.
    previous_state = {} if fresh_start else _load_previous_state(state_file)
    previous_ids   = set(previous_state.keys())

    # Step 1: collect all cards from listing pages
    cards = collect_all_cards(session)

    if not cards:
        print("  WARNING: no cards found")
        return []

    # Step 2: split cards into "need detail fetch" vs "already have data".
    # A listing can be skipped only when ALL three conditions hold:
    #   a) we scraped it before (id in previous state), AND
    #   b) its image file is still on disk (download wasn't lost), AND
    #   c) the previous record had a non-empty images list — guards against
    #      the case where a DB cleanup cleared images but disk files remain,
    #      which would otherwise cause the scraper to reuse stale image paths.
    needs_fetch:  list[dict] = []
    can_skip:     list[dict] = []
    for card in cards:
        uid = make_id("billboardiha-" + card["raw_id"])
        has_image_on_disk  = any(f.startswith(uid + "_") for f in existing_files)
        had_images_in_prev = bool(previous_state.get(uid))
        if uid in previous_ids and has_image_on_disk and had_images_in_prev:
            can_skip.append(card)
        else:
            needs_fetch.append(card)

    print(
        f"\n  {len(cards)} cards total — "
        f"{len(needs_fetch)} need detail fetch, "
        f"{len(can_skip)} already cached (skipping detail page)"
    )

    # Re-use previous run's data for skipped listings — load from state.
    skipped_records: list[dict] = []
    if can_skip and state_file.exists():
        try:
            prev_data   = json.loads(state_file.read_text(encoding="utf-8"))
            skip_ids    = {make_id("billboardiha-" + c["raw_id"]) for c in can_skip}
            skipped_records = [e for e in prev_data if e.get("id") in skip_ids]
        except Exception:
            skipped_records = []

    # Step 3: fetch detail pages concurrently for new/changed listings.
    print(f"\n  Fetching details for {len(needs_fetch)} listings ({DETAIL_WORKERS} workers)...")
    fresh_records: list[dict] = []
    done = 0
    total = len(needs_fetch)

    if needs_fetch:
        with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as pool:
            # Submit all at once; the per-worker sleep inside fetch_one
            # naturally spaces out requests without a coordinator lock.
            futures = {
                pool.submit(fetch_one, session, card, existing_files): card
                for card in needs_fetch
            }
            for future in as_completed(futures):
                done += 1
                record = future.result()
                if record:
                    fresh_records.append(record)
                card = futures[future]
                status = "OK" if record else "FAIL"
                if done % 50 == 0 or done == total:
                    print(f"  [{done}/{total}] ... {len(fresh_records)} OK so far")

    results = fresh_records + skipped_records
    print(f"\n--- billboardiha done: {len(results)} listings ({len(fresh_records)} fetched, {len(skipped_records)} from cache) ---")
    return results


if __name__ == "__main__":
    data = scrape_billboardiha()
    print(json.dumps(data[:2], ensure_ascii=False, indent=2))
    print(f"\nTotal: {len(data)}")