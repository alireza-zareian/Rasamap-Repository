#!/usr/bin/env python3
"""
Rasamap Billboard Scraper
=========================
Sources (تخصصی بیلبورد):
  1. billboardiha.com  — pagination + GPS
  2. irbillboard.com   — listings page, real GPS coordinates
  3. aradholding.com   — HTML table, real GPS from Google Maps links

Removed (data quality):
  - divar.ir    — آگهی‌های غیربیلبورد (نقاشی، دکوری) مخلوط می‌شد
  - sheypoor.com — همان مشکل، هیچ داده قابل استفاده‌ای برنگشت

Output: scraper/data/billboards.json  (auto-imported by lib/data.ts)

Self-cleaning: listings that disappear from every source for
MAX_MISSED_RUNS consecutive runs (e.g. a billboard got torn down) are
automatically marked inactive — nothing accumulates forever.

Usage:
  pip install requests beautifulsoup4 lxml
  python scraper.py
"""

import json, time, re, random, hashlib, os
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from image_utils import existing_variant, save_optimized

# ── Try imports gracefully ──────────────────────────────────────
try:
    import requests
    from bs4 import BeautifulSoup
    HAS_BS = True
except ImportError:
    HAS_BS = False
    print("⚠  requests/bs4 not found. Run: pip install requests beautifulsoup4")

# NOTE: Playwright is intentionally NOT imported. All four scrapers use
# requests + BeautifulSoup only. Playwright was never called anywhere in
# this codebase — the import was dead code that also forced a large
# 'playwright install' step in CI (~3 min) on every nightly run.

OUTPUT_DIR = Path(__file__).parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)
OUTPUT_FILE = OUTPUT_DIR / "billboards.json"
STATE_FILE  = OUTPUT_DIR / "scrape_state.json"
RAW_DEBUG_FILE = OUTPUT_DIR / "raw_latest.json"
GEOCODE_CACHE_FILE = OUTPUT_DIR / "geocode_cache.json"

IMAGE_DIR = Path(__file__).parent.parent / "public" / "images" / "scraped"
IMAGE_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_WEB_PREFIX = "/images/scraped"
MAX_IMAGES_PER_LISTING = 5

MAX_MISSED_RUNS = 3

# ── Stealth layer ────────────────────────────────────────────────
# Real Chrome/Safari/Firefox UAs on Mac + Windows — rotated per session.
# Keeps pattern different from the previous run so server-side UA tracking
# doesn't build a fingerprint on a single string.
_UA_POOL = [
    # Chrome 124 — Mac
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Chrome 123 — Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    # Chrome 122 — Linux
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    # Firefox 125 — Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    # Firefox 124 — Mac
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0",
    # Safari 17 — Mac
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    # Edge 124 — Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    # Chrome 121 — Android (mobile traffic also expected on Iranian sites)
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36",
]

_ACCEPT_LANGUAGE_POOL = [
    "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",
    "fa-IR,fa;q=0.95,en;q=0.8",
    "fa;q=0.9,en-US;q=0.8,en;q=0.7",
    "fa-IR,fa;q=0.9,ar;q=0.7,en;q=0.5",
]


def _stealth_headers(referer: str = "") -> dict:
    """Build a realistic browser header set for one request."""
    ua = random.choice(_UA_POOL)
    is_firefox = "Firefox" in ua
    headers = {
        "User-Agent": ua,
        "Accept-Language": random.choice(_ACCEPT_LANGUAGE_POOL),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
            if is_firefox else
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
        ),
        "Accept-Encoding": "gzip, deflate",  # omit 'br' — requests can't decompress Brotli
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "DNT": random.choice(["1", "1", "0"]),  # 2/3 chance DNT=1
    }
    if referer:
        headers["Referer"] = referer
    # sec-ch-ua only for Chromium-based UAs
    if "Chrome" in ua or "Edg/" in ua:
        version = re.search(r"Chrome/(\d+)", ua)
        v = version.group(1) if version else "124"
        headers["sec-ch-ua"] = f'"Chromium";v="{v}", "Google Chrome";v="{v}", "Not-A.Brand";v="99"'
        headers["sec-ch-ua-mobile"] = "?1" if "Mobile" in ua else "?0"
        headers["sec-ch-ua-platform"] = (
            '"Android"' if "Android" in ua else
            '"macOS"' if "Macintosh" in ua else
            '"Linux"' if "Linux" in ua else '"Windows"'
        )
        headers["Sec-Fetch-Dest"] = "document"
        headers["Sec-Fetch-Mode"] = "navigate"
        headers["Sec-Fetch-Site"] = "same-origin" if referer else "none"
        headers["Sec-Fetch-User"] = "?1"
    return headers


def make_stealth_session(base_url: str) -> "requests.Session":
    """
    Create a requests.Session that looks like a real browser.
    Warms up by fetching the homepage first (sets cookies, referer chain).
    """
    session = requests.Session()
    session.headers.update(_stealth_headers())
    try:
        # Warm-up: visit homepage to pick up any session cookies / CDN fingerprint
        session.get(base_url, timeout=10)
        time.sleep(random.uniform(1.0, 2.5))
    except Exception:
        pass
    return session


def polite_sleep(mn=2.0, mx=5.0):
    """
    Gaussian jitter delay — more natural than uniform distribution.
    Occasionally throws in a longer pause to simulate reading time.
    """
    base = random.gauss((mn + mx) / 2, (mx - mn) / 4)
    delay = max(mn, min(mx * 1.5, base))
    # 10% chance of a longer "reading" pause
    if random.random() < 0.10:
        delay += random.uniform(3, 8)
    time.sleep(delay)


HEADERS = {
    "User-Agent": _UA_POOL[0],
    "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


# ── Network resilience layer ──────────────────────────────────────
# Built for Iranian connection conditions: DPI-triggered resets, ISP
# throttling, brief drops when toggling VPN, and CDN/WAF challenge
# pages (Arvancloud, Cloudflare, DDoS-Guard) that many Iranian sites
# sit behind. Every network call in this project should go through
# fetch_with_retry() instead of calling requests.get/post directly.

def fetch_with_retry(
    client,
    method: str,
    url: str,
    *,
    max_retries: int = 4,
    base_delay: float = 2.0,
    timeout: float = 15,
    **kwargs,
):
    """
    Resilient request wrapper.

    client: either the `requests` module itself, or a requests.Session —
            both expose .request(method, url, **kwargs).
    Retries on: ConnectionError, Timeout, SSLError, and HTTP 429/502/503/504.
    Backoff: base_delay * 2^attempt, plus up to 30% jitter.
    Honors a numeric Retry-After header when the server sends one.
    Raises the last exception if every attempt fails (caller decides
    whether to catch it — most call sites already wrap in try/except).
    """
    kwargs.pop("timeout", None)
    last_exc: Exception | None = None
    resp = None
    for attempt in range(max_retries):
        try:
            resp = client.request(method, url, timeout=timeout, **kwargs)
        except (requests.exceptions.ConnectionError,
                requests.exceptions.Timeout,
                requests.exceptions.SSLError) as e:
            last_exc = e
            if attempt < max_retries - 1:
                wait = base_delay * (2 ** attempt)
                time.sleep(wait + random.uniform(0, wait * 0.3))
                continue
            raise
        if resp.status_code in (429, 502, 503, 504) and attempt < max_retries - 1:
            retry_after = resp.headers.get("Retry-After", "")
            wait = float(retry_after) if retry_after.isdigit() else base_delay * (2 ** attempt)
            time.sleep(wait + random.uniform(0, wait * 0.3))
            continue
        return resp
    if last_exc:
        raise last_exc
    return resp


_CHALLENGE_MARKERS = [
    "checking your browser", "just a moment", "captcha",
    "cf-browser-verification", "arvancloud", "attention required",
    "ddos-guard", "access denied", "enable javascript and cookies",
]

def looks_like_challenge_page(html: str) -> bool:
    """
    Detects WAF/anti-bot challenge pages that return HTTP 200 with no
    real content — common on Iranian hosting behind Arvancloud/Cloudflare.
    A real listing page is always much longer than a challenge page.
    """
    if len(html) < 3000:
        low = html.lower()
        return any(m in low for m in _CHALLENGE_MARKERS)
    return False


# ── Per-site scraper module imports ───────────────────────────────
# Imported here (not at the top of the file) so that scraper_billboardiha.py
# and scraper_aradholding.py can do `from scraper import _stealth_headers,
# make_stealth_session, fetch_with_retry, ...` without hitting a circular
# import. If those imports happened before this point, Python would still
# be mid-way through loading this module — the names above wouldn't exist
# yet, the sub-module's import would silently fail, and it would fall back
# to non-stealth requests without any error being raised.
try:
    from scraper_billboardiha import scrape_billboardiha as _scrape_billboardiha
    HAS_BILLBOARDIHA = True
except ImportError as e:
    HAS_BILLBOARDIHA = False
    print(f"⚠  scraper_billboardiha.py not importable ({e}) — billboardiha.com will be skipped")

try:
    from scraper_aradholding import scrape_aradholding as _scrape_aradholding
    HAS_ARADHOLDING = True
except ImportError as e:
    HAS_ARADHOLDING = False
    print(f"⚠  scraper_aradholding.py not importable ({e}) — aradholding.com will be skipped")

def make_id(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:8]

def extract_phone(text: str) -> str:
    """Extract first Iranian phone number from text.
    Handles: mobile 09xx, landlines 0xx, +98 prefix, 0098 prefix,
    Persian digits, invisible Unicode, various spacing/dash formats."""
    fa = "۰۱۲۳۴۵۶۷۸۹"
    for i, c in enumerate(fa):
        text = text.replace(c, str(i))
    # Strip invisible Unicode and non-breaking spaces
    for ch in ("‌", "‍", " ", " ", " "):
        text = text.replace(ch, " ")

    # Normalize +98 / 0098 -> leading 0
    text = re.sub(r'\+98\s*', '0', text)
    text = re.sub(r'0098\s*', '0', text)

    # Mobile: 09XXXXXXXXX (10 digits), any inter-group spacing or dash
    m = re.search(r'09[0-9]{2}[-\s]?[0-9]{3}[-\s]?[0-9]{4}', text)
    if m:
        return re.sub(r'\D', '', m.group())

    # Landline: area code 0XX + 7-8 digits with arbitrary spacing/grouping
    # Covers: 021-XXXXXXXX | 021 4055 1408 | 021 40 55 14 08 | 031 3333 4444
    m = re.search(r'0[1-8][0-9](?:[-\s]?[0-9]{2,4}){2,4}', text)
    if m:
        digits = re.sub(r'\D', '', m.group())
        if len(digits) in (10, 11):
            return digits

    return ""


def clean_price(text: str) -> int | None:
    """Extract million toman price from Persian text"""
    text = text.replace("\u200c", "").replace(",", "")
    fa = "۰۱۲۳۴۵۶۷۸۹"  # Persian digit chars
    for i, c in enumerate(fa):
        text = text.replace(c, str(i))
    nums = re.findall(r"\d+", text)
    if not nums:
        return None
    val = int(nums[0])
    if "میلیون" in text or "M" in text:
        return val
    if val > 1_000_000:
        return val // 1_000_000
    if val > 1_000:
        return val // 1_000
    return val

try:
    from traffic_formula import estimate_traffic as _tf_traffic, estimate_price as _tf_price
    _HAS_FORMULA = True
except ImportError:
    _HAS_FORMULA = False

def estimate_traffic(region: str, board_type: str, city: str = "", width: float = 6.0, height: float = 4.0) -> dict:
    """Heuristic traffic estimate — delegates to traffic_formula when available."""
    if _HAS_FORMULA:
        return _tf_traffic(city or "تهران", region, board_type, width, height)
    daily = 150_000
    return {
        "daily": daily, "peakHour": "08:00-09:00",
        "congestionLevel": 4, "pedestrian": 12000,
        "estimatedViews": 52500, "viewabilityScore": 42,
    }

def estimate_price_fallback(city: str, board_type: str, width: float = 6.0, height: float = 4.0) -> int:
    if _HAS_FORMULA:
        return _tf_price(city, board_type, width, height)
    return random.randint(30, 250)

def infer_type(title: str, desc: str = "") -> str:
    text = (title + " " + desc).lower()
    if any(w in text for w in ["دیجیتال", "led", "تلویزیون", "ال ای دی"]):
        return "digital"
    if any(w in text for w in ["پل", "عرشه", "زیرگذر", "روگذر"]):
        return "bridge"
    if any(w in text for w in ["ایستگاه", "مترو", "بی آر تی", "brt"]):
        return "station"
    return "billboard"

def download_images(urls: list[str], listing_id: str, existing_files: set[str]) -> list[str]:
    """
    Downloads listing photos into /public/images/scraped/. Opaque PNGs are
    re-encoded to JPEG on write — see scraper/image_utils.py.
    existing_files: pre-built set of filenames already on disk — avoids
    a stat() syscall per image on every scraper run.
    """
    saved = []
    for i, url in enumerate(urls[:MAX_IMAGES_PER_LISTING]):
        if not url:
            continue
        try:
            stem = f"{listing_id}_{i}"
            have = existing_variant(existing_files, stem)
            if have:  # already downloaded on a previous run, any extension
                saved.append(f"{IMAGE_WEB_PREFIX}/{have}")
                continue
            ext = os.path.splitext(urlparse(url).path)[1] or ".jpg"
            if ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                ext = ".jpg"
            resp = fetch_with_retry(requests, "GET", url, headers=_stealth_headers(), timeout=10, stream=True, max_retries=2)
            resp.raise_for_status()
            data = resp.content
            if len(data) < 10_000:
                continue  # placeholder / logo image — discard
            fname = save_optimized(data, IMAGE_DIR / f"{stem}{ext}")
            existing_files.add(fname)
            time.sleep(random.uniform(0.3, 0.8))
            saved.append(f"{IMAGE_WEB_PREFIX}/{fname}")
        except Exception:
            continue
    return saved

def delete_images_for(listing_id: str) -> int:
    """Deletes every downloaded photo belonging to one listing id."""
    removed = 0
    for f in IMAGE_DIR.glob(f"{listing_id}_*"):
        try:
            f.unlink()
            removed += 1
        except OSError:
            pass
    return removed

# ── Scraper 1: Divar ────────────────────────────────────────────
def scrape_divar(existing_files: set[str]) -> list[dict]:
    """
    Divar has two usable search approaches:
      A) keyword-only (no category filter) — catches billboard ads across categories
      B) "تابلو تبلیغاتی اجاره" keyword
    Uses a seen-ID set for O(1) duplicate checking instead of O(n) list scan.
    """
    if not HAS_BS:
        return []

    results: list[dict] = []
    seen_ids: set[str] = set()  # O(1) dedup instead of any(r["id"]==... for r in results)
    print("\n📡 Divar scraper starting...")

    session = make_stealth_session("https://divar.ir")
    cities = ["tehran", "isfahan", "mashhad", "shiraz", "tabriz", "ahvaz"]
    DIVAR_API = "https://api.divar.ir/v8/postlist/w/search"

    for city in cities:
        city_start = len(results)
        try:
            # ── Approach A: keyword-only (no category filter) ──────────────
            payload = {
                "json_schema": {"cities": [city]},
                "query": "بیلبورد اجاره",
                "source": "QUERY",
                "page": 1,
            }
            resp = fetch_with_retry(session, "POST", DIVAR_API, json=payload, timeout=12)
            if not resp.ok:
                print(f"  ✗ Divar {city}: HTTP {resp.status_code} — skipping")
                continue
            body = resp.text.strip()
            if not body or body[0] not in ("{", "["):
                print(f"  ✗ Divar {city}: blocked or empty response (len={len(body)})")
                continue

            for post in resp.json().get("list_widgets", []):
                if "data" not in post:
                    continue
                d = post["data"]
                title = d.get("title", "")
                if not any(w in title for w in ["بیلبورد", "تابلو", "رسانه", "تبلیغ"]):
                    continue
                desc       = d.get("top_description_text", "")
                price_text = d.get("middle_description_text", "")
                district   = d.get("bottom_description_text", city)
                token      = d.get("token", "")
                board_type = infer_type(title, desc)
                price      = clean_price(price_text) or estimate_price_fallback(city, board_type)
                listing_id = make_id("divar-" + (token or title + district))
                if listing_id in seen_ids:
                    continue
                seen_ids.add(listing_id)
                img_url = d.get("image_url") or (d.get("image") or {}).get("url")
                images  = download_images([img_url], listing_id, existing_files) if img_url else []
                # Try to find phone in list-level description first
                phone = extract_phone(desc + " " + price_text + " " + title)
                # If not found and we have a token, try Divar detail API (best-effort)
                if not phone and token:
                    try:
                        dr = fetch_with_retry(session, "GET",
                            f"https://api.divar.ir/v8/posts/{token}",
                            timeout=8, max_retries=1)
                        if dr.ok:
                            body_d = dr.json()
                            full_text = " ".join(
                                str(sec.get("data", {}).get("text", ""))
                                for sec in body_d.get("sections", [])
                            )
                            phone = extract_phone(full_text)
                    except Exception:
                        pass
                results.append({
                    "id": listing_id, "source": "divar",
                    "name": title, "location": desc or district,
                    "region": district, "city": city, "type": board_type,
                    "status": "available", "price": price,
                    "phone": phone,
                    "agency": "دیوار",
                    "traffic": estimate_traffic(district, board_type, city),
                    "images": images, "scrapedAt": datetime.now().isoformat(),
                })

            # ── Approaches B-F: additional keyword queries ────────────────
            extra_queries = [
                "تابلو تبلیغاتی اجاره",
                "لمپوست اجاره",
                "استرابورد اجاره",
                "تلویزیون شهری اجاره",
                "عرشه پل اجاره",
            ]
            for extra_q in extra_queries:
                try:
                    resp2 = fetch_with_retry(session, "POST", DIVAR_API, json={**payload, "query": extra_q}, timeout=12, max_retries=2)
                except Exception:
                    continue
                if not resp2.ok:
                    continue
                body2 = resp2.text.strip()
                if not body2 or body2[0] not in ("{", "["):
                    continue
                for post in resp2.json().get("list_widgets", []):
                    if "data" not in post:
                        continue
                    d = post["data"]
                    title = d.get("title", "")
                    if not any(w in title for w in ["بیلبورد", "تابلو", "رسانه", "تبلیغ", "لمپوست", "استرابورد", "عرشه"]):
                        continue
                    d_token = d.get("token", "")
                    listing_id = make_id("divar-" + (d_token or title))
                    if listing_id in seen_ids:
                        continue
                    seen_ids.add(listing_id)
                    district = d.get("bottom_description_text", city)
                    board_type = infer_type(title)
                    price = clean_price(d.get("middle_description_text", "")) or estimate_price_fallback(city, board_type)
                    img_url = d.get("image_url")
                    images = download_images([img_url], listing_id, existing_files) if img_url else []
                    d_desc = d.get("top_description_text", "")
                    phone = extract_phone(d_desc + " " + d.get("middle_description_text", "") + " " + title)
                    if not phone and d_token:
                        try:
                            dr = fetch_with_retry(session, "GET",
                                f"https://api.divar.ir/v8/posts/{d_token}",
                                timeout=8, max_retries=1)
                            if dr.ok:
                                full_text = " ".join(
                                    str(sec.get("data", {}).get("text", ""))
                                    for sec in dr.json().get("sections", [])
                                )
                                phone = extract_phone(full_text)
                        except Exception:
                            pass
                    results.append({
                        "id": listing_id, "source": "divar",
                        "name": title,
                        "location": d_desc or district,
                        "region": district, "city": city, "type": board_type,
                        "status": "available", "price": price,
                        "phone": phone,
                        "agency": "دیوار",
                        "traffic": estimate_traffic(district, board_type, city),
                        "images": images, "scrapedAt": datetime.now().isoformat(),
                    })

            print(f"  ✓ {city}: {len(results) - city_start} ad(s)")
            polite_sleep()

        except Exception as e:
            print(f"  ✗ Divar {city}: {e}")

    return results

# ── Scraper 2: Sheypoor ─────────────────────────────────────────
def scrape_sheypoor(existing_files: set[str]) -> list[dict]:
    """
    Uses a seen-ID set for O(1) duplicate detection instead of O(n) list scan.
    """
    if not HAS_BS:
        return []

    results: list[dict] = []
    seen_ids: set[str] = set()
    print("\n📡 Sheypoor scraper starting...")

    session = make_stealth_session("https://www.sheypoor.com")
    search_queries = [
        "https://www.sheypoor.com/s/iran/advertising?q=%D8%A8%DB%8C%D9%84%D8%A8%D9%88%D8%B1%D8%AF",
        "https://www.sheypoor.com/s/iran?q=%D8%AA%D8%A7%D8%A8%D9%84%D9%88+%D8%AA%D8%A8%D9%84%DB%8C%D8%BA%D8%A7%D8%AA%DB%8C",
        "https://www.sheypoor.com/s/iran/advertising?q=%D9%84%D9%85%D9%BE%D9%88%D8%B3%D8%AA",
        "https://www.sheypoor.com/s/iran/advertising?q=%D8%A7%D8%B3%D8%AA%D8%B1%D8%A7%D8%A8%D9%88%D8%B1%D8%AF",
        "https://www.sheypoor.com/s/iran/advertising?q=%D8%AA%D9%84%D9%88%DB%8C%D8%B2%DB%8C%D9%88%D9%86+%D8%B4%D9%87%D8%B1%DB%8C",
        "https://www.sheypoor.com/s/iran/advertising?q=%D8%B9%D8%B1%D8%B4%D9%87+%D9%BE%D9%84",
    ]

    for url in search_queries:
        try:
            resp = fetch_with_retry(session, "GET", url, timeout=14)
            if looks_like_challenge_page(resp.text):
                print(f"  ⚠ Sheypoor ({url[-25:]}): challenge/WAF page detected — skipped (not a code bug)")
                continue
            soup = BeautifulSoup(resp.text, "html.parser")

            # ── Strategy 1: JSON-LD (most reliable) ──────────────────────
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    data = json.loads(script.string or "")
                    items = data if isinstance(data, list) else data.get("@graph", [data])
                    for item in items:
                        name = item.get("name", "")
                        if not any(w in name for w in ["بیلبورد", "تابلو", "رسانه", "تبلیغ", "لمپوست", "استرابورد", "عرشه"]):
                            continue
                        listing_id = make_id("sheypoor-" + name + item.get("url", ""))
                        if listing_id in seen_ids:
                            continue
                        seen_ids.add(listing_id)
                        img_url = item.get("image") or (item.get("offers") or {}).get("image")
                        images  = download_images([img_url], listing_id, existing_files) if img_url else []
                        board_type = infer_type(name)
                        price   = clean_price(str((item.get("offers") or {}).get("price", ""))) or estimate_price_fallback("تهران", board_type)
                        item_desc = item.get("description", "")
                        seller_phone = extract_phone(
                            item_desc + " " +
                            str((item.get("seller") or {}).get("telephone", "")) + " " +
                            str((item.get("offers") or {}).get("seller", {}).get("telephone", "") if isinstance((item.get("offers") or {}).get("seller"), dict) else "")
                        )
                        results.append({
                            "id": listing_id, "source": "sheypoor",
                            "name": name,
                            "location": item_desc[:80],
                            "region": "نامشخص", "city": "تهران",
                            "type": board_type,
                            "status": "available", "price": price,
                            "phone": seller_phone,
                            "agency": "شیپور",
                            "traffic": estimate_traffic("", "billboard", "تهران"),
                            "images": images,
                            "scrapedAt": datetime.now().isoformat(),
                        })
                except Exception:
                    continue

            # ── Strategy 2: semantic HTML ─────────────────────────────────
            articles = soup.find_all("article") or soup.find_all("li", attrs={"data-testid": True})
            for card in articles[:25]:
                title_el = card.find(["h2", "h3"]) or card.find(attrs={"itemprop": "name"})
                price_el = card.find(attrs={"itemprop": "price"}) or card.find(string=re.compile(r"تومان|میلیون"))
                img_el   = card.find("img")
                loc_el   = card.find(attrs={"itemprop": "addressLocality"}) or card.find(["span", "p"], string=re.compile(r"تهران|اصفهان|شیراز|مشهد"))

                title = title_el.get_text(strip=True) if title_el else ""
                if not title or not any(w in title for w in ["بیلبورد", "تابلو", "رسانه", "تبلیغ", "لمپوست", "استرابورد", "عرشه"]):
                    continue

                location   = loc_el.get_text(strip=True) if loc_el else ""
                listing_id = make_id("sheypoor-" + title + location)
                if listing_id in seen_ids:
                    continue
                seen_ids.add(listing_id)

                price_text = price_el.get_text(strip=True) if hasattr(price_el, "get_text") else str(price_el or "")
                img_url    = (img_el.get("data-src") or img_el.get("src")) if img_el else None
                images     = download_images([img_url], listing_id, existing_files) if img_url else []
                card_text  = card.get_text(" ", strip=True)
                card_city  = guess_city(location) or "تهران"
                card_type  = infer_type(title)

                results.append({
                    "id": listing_id, "source": "sheypoor",
                    "name": title, "location": location, "region": location,
                    "city": card_city,
                    "type": card_type,
                    "status": "available",
                    "price": clean_price(price_text) or estimate_price_fallback(card_city, card_type),
                    "phone": extract_phone(card_text),
                    "agency": "شیپور",
                    "traffic": estimate_traffic(location, "billboard", card_city),
                    "images": images,
                    "scrapedAt": datetime.now().isoformat(),
                })

            polite_sleep()

        except Exception as e:
            print(f"  ✗ Sheypoor ({url[:40]}...): {e}")

    print(f"  ✓ sheypoor: {len(results)} ad(s)")
    return results

# ── Scraper 3: Billboardiha ─────────────────────────────────────
def scrape_billboardiha(fresh_start: bool = False) -> list[dict]:
    if not HAS_BILLBOARDIHA:
        print("\n⚠  scraper_billboardiha.py unavailable — skipping billboardiha.com")
        return []
    return _scrape_billboardiha(fresh_start=fresh_start)

# ── Scraper 4: irbillboard.com ──────────────────────────────────
# (irbillboard scraper body follows below)

# ── Scraper 5: aradholding.com ──────────────────────────────────
def scrape_aradholding() -> list[dict]:
    if not HAS_ARADHOLDING:
        print("\n⚠  scraper_aradholding.py unavailable — skipping aradholding.com")
        return []
    existing_files = {f.name for f in IMAGE_DIR.iterdir() if f.is_file()}
    return _scrape_aradholding(existing_files)

# ── irbillboard scraper starts here ─────────────────────────────
KNOWN_CITIES = [
    "تهران","کرج","اصفهان","مشهد","شیراز","تبریز","اهواز","قم","کرمانشاه","رشت",
    "زنجان","یزد","ارومیه","کرمان","همدان","اراک","بندرعباس","ساری","قزوین",
    "خرم‌آباد","سنندج","اردبیل","بوشهر","گرگان","سمنان","ایلام","بیرجند",
    "بجنورد","یاسوج","شهرکرد","زاهدان","مبارکه","تنکابن","نجف‌آباد","کاشان",
]

def guess_city(text: str) -> str:
    for c in KNOWN_CITIES:
        if c in text:
            return c
    return ""

def extract_number(text: str) -> float | None:
    fa = "۰۱۲۳۴۵۶۷۸۹"  # Persian digit chars
    for i, c in enumerate(fa):
        text = text.replace(c, str(i))
    m = re.search(r"\d+(?:\.\d+)?", text)
    return float(m.group()) if m else None

def extract_field(flat_text: str, label: str) -> str:
    m = re.search(re.escape(label) + r"\s*[:\-]?\s*\n*\s*([^\n]{2,120})", flat_text)
    return m.group(1).strip() if m else ""


def _extract_coords(html: str, soup) -> tuple[float | None, float | None]:
    """
    Shared helper: extract GPS coordinates from any page HTML.
    Priority order (most reliable → least):
      1. JSON-LD geo / location fields
      2. data-lat / data-lng attributes on any element
      3. Google Maps links (maps?q= and @lat,lng,Nz)
      4. Neshan / Balad map links
      5. JavaScript variable patterns (lat:, lng:, latitude:, longitude:)
      6. <meta> name/property coordinate tags

    Returns (lat, lng) or (None, None).
    NEVER modifies any other field on the record.
    """
    lat: float | None = None
    lng: float | None = None

    # ── 1. JSON-LD ──────────────────────────────────────────────
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

    # ── 2. data-lat / data-lng / data-latitude / data-longitude ─
    for el in soup.find_all(True, {"data-lat": True}):
        try:
            lat_c = el.get("data-lat") or el.get("data-latitude")
            lng_c = el.get("data-lng") or el.get("data-long") or el.get("data-longitude")
            if lat_c and lng_c:
                return float(lat_c), float(lng_c)
        except Exception:
            continue

    # ── 3. Google Maps links ─────────────────────────────────────
    for pattern in [
        r"maps\.google\.com/maps\?q=([\d.\-]+)[,%2C]+([\d.\-]+)",
        r"maps\.google\.com/maps\?.*?ll=([\d.\-]+),([\d.\-]+)",
        r"google\.com/maps/place/[^/]*/(@|@?)([\d.\-]+),([\d.\-]+),\d+z",
        r"@([\d.\-]+),([\d.\-]+),\d+z",
    ]:
        m = re.search(pattern, html)
        if m:
            try:
                g1, g2 = m.group(m.lastindex - 1), m.group(m.lastindex)
                lat_c, lng_c = float(g1), float(g2)
                # Sanity check: must be inside Iran bounding box
                if 24 < lat_c < 40 and 44 < lng_c < 64:
                    return lat_c, lng_c
            except Exception:
                continue

    # ── 4. Neshan / Balad map links ──────────────────────────────
    for pattern in [
        r"neshan\.org/[^\"']*[?&]lat=([\d.\-]+)[^\"']*[?&]lng=([\d.\-]+)",
        r"neshan\.org/[^\"']*/([\d.\-]+),([\d.\-]+)",
        r"balad\.ir/[^\"']*[?&]lat=([\d.\-]+).*?lng=([\d.\-]+)",
    ]:
        m = re.search(pattern, html)
        if m:
            try:
                return float(m.group(1)), float(m.group(2))
            except Exception:
                continue

    # ── 5. JavaScript variable patterns ─────────────────────────
    for pattern in [
        r'["\']?lat(?:itude)?["\']?\s*[:=]\s*([\d.\-]+)',
        r'["\']?lng["\']?\s*[:=]\s*([\d.\-]+)',
        r'["\']?longitude["\']?\s*[:=]\s*([\d.\-]+)',
    ]:
        m_lat = re.search(r'["\']?lat(?:itude)?["\']?\s*[:=]\s*([\d.\-]+)', html)
        m_lng = re.search(r'["\']?l(?:ng|ongitude)["\']?\s*[:=]\s*([\d.\-]+)', html)
        if m_lat and m_lng:
            try:
                lat_c, lng_c = float(m_lat.group(1)), float(m_lng.group(1))
                if 24 < lat_c < 40 and 44 < lng_c < 64:
                    return lat_c, lng_c
            except Exception:
                pass
        break

    # ── 6. <meta> coordinate tags ────────────────────────────────
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


def fetch_one_board(session: "requests.Session", url: str, existing_files: set[str]) -> dict | None:
    """Fetch and parse a single irbillboard listing. Returns None on failure."""
    try:
        resp = fetch_with_retry(session, "GET", url, timeout=8, max_retries=2)
        resp.raise_for_status()
        html = resp.text
        soup = BeautifulSoup(html, "html.parser")
        flat = soup.get_text("\n")

        slug  = url.rstrip("/").split("/")[-1]
        h1    = soup.find("h1")
        title = h1.get_text(strip=True) if h1 else slug.replace("-", " ")

        address    = extract_field(flat, "آدرس")
        type_raw   = extract_field(flat, "نوع رسانه")
        height_raw = extract_field(flat, "ارتفاع")
        width_raw  = extract_field(flat, "طول")

        lat, lng = _extract_coords(html, soup)

        img_m   = re.search(r'src="([^"]*wp-content/uploads[^"]*\.(?:jpg|jpeg|png|webp))"', html, re.I)
        img_url = img_m.group(1) if img_m else None

        city       = guess_city(address) or guess_city(title)
        listing_id = make_id("irbillboard-" + slug)
        board_type = infer_type(title + " " + type_raw)
        images     = download_images([img_url], listing_id, existing_files) if img_url else []
        phone      = extract_phone(flat)

        return {
            "id": listing_id, "source": "irbillboard",
            "name": title,
            "location": address or title,
            "region": address or "—",
            "city": city or "تهران",
            "type": board_type, "status": "available",
            "lat": lat, "lng": lng,
            "price": estimate_price_fallback(city or "تهران", board_type),
            "phone": phone,
            "agency": "IRBillboard",
            "traffic": estimate_traffic(address, board_type, city or "تهران"),
            "images": images,
            "scrapedAt": datetime.now().isoformat(),
            "_widthRaw": extract_number(width_raw),
            "_heightRaw": extract_number(height_raw),
        }
    except Exception:
        return None


def scrape_irbillboard(existing_files: set[str], max_pages: int = 4) -> list[dict]:
    """
    Uses WordPress sitemap to get all board URLs at once, then fetches
    them in parallel (8 workers).
    """
    if not HAS_BS:
        return []

    from concurrent.futures import ThreadPoolExecutor, as_completed
    from bs4 import XMLParsedAsHTMLWarning
    import warnings
    warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

    results = []
    print("\n📡 irbillboard.com scraper starting...")

    session = make_stealth_session("https://irbillboard.com")
    board_urls: set[str] = set()

    # ── Sitemap discovery ─────────────────────────────────────────────────
    for smap_url in [
        "https://irbillboard.com/wp-sitemap-posts-boards-1.xml",
        "https://irbillboard.com/boards-sitemap.xml",
        "https://irbillboard.com/sitemap_index.xml",
        "https://irbillboard.com/sitemap.xml",
    ]:
        try:
            r = fetch_with_retry(session, "GET", smap_url, timeout=10, max_retries=2)
            if r.status_code != 200:
                continue
            soup = BeautifulSoup(r.content, features="xml")
            locs = [t.get_text(strip=True) for t in soup.find_all("loc")]
            for child in [l for l in locs if "boards" in l and l.endswith(".xml")]:
                try:
                    cr = fetch_with_retry(session, "GET", child, timeout=10, max_retries=2)
                    cs = BeautifulSoup(cr.content, features="xml")
                    locs += [t.get_text(strip=True) for t in cs.find_all("loc")]
                except Exception:
                    pass
            found = {l for l in locs if "/boards/" in l and not l.endswith(".xml")}
            if found:
                board_urls |= found
                print(f"  → sitemap {smap_url.split('/')[-1]}: {len(found)} URL(s)")
                break
        except Exception as e:
            print(f"  ✗ sitemap {smap_url.split('/')[-1]}: {e}")

    # ── Fallback: paginate HTML ───────────────────────────────────────────
    if not board_urls:
        print("  → no sitemap, paginating...")
        for page_num in range(1, max_pages + 1):
            url = ("https://irbillboard.com/boards/" if page_num == 1
                   else f"https://irbillboard.com/boards/page/{page_num}/")
            try:
                resp = fetch_with_retry(session, "GET", url, timeout=10, max_retries=2)
                if resp.status_code == 404:
                    break
                if looks_like_challenge_page(resp.text):
                    print(f"  \u26A0 page {page_num}: challenge/WAF page detected \u2014 stopping pagination")
                    break
                found = {f"https://irbillboard.com/boards/{s}/"
                         for s in re.findall(r'https://irbillboard\.com/boards/([\w\u0600-\u06FF\-]+)/?', resp.text)
                         if s != "page"}
                if not found - board_urls:
                    break
                board_urls |= found
                time.sleep(0.5)
            except Exception as e:
                print(f"  ✗ page {page_num}: {e}"); break

    print(f"  → {len(board_urls)} URL(s) — fetching in parallel (8 workers)...")

    # ── Parallel fetch ────────────────────────────────────────────────────
    done = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_one_board, session, url, existing_files): url for url in board_urls}
        for future in as_completed(futures):
            done += 1
            result = future.result()
            if result:
                results.append(result)
            if done % 20 == 0 or done == len(board_urls):
                print(f"  ... {done}/{len(board_urls)} fetched, {len(results)} ok")

    print(f"  ✓ irbillboard: {len(results)} listing(s)")
    return results

# ── Cross-source dedup (runs BEFORE the intra-source dedup() below) ──
# dedup() only catches duplicates within a single source, because each
# source hashes its own id (e.g. "divar-<token>" vs "sheypoor-<token>").
# The same physical billboard posted on two different sites therefore
# gets two different ids and sails straight through dedup() untouched.
#
# NOTE: an earlier version of this matched by GPS distance (<50m). That
# was dropped — two *different* billboards on opposite sides of the same
# street, or at a nearby intersection, can easily be under 50m apart, so
# distance alone produced false positives. This version instead matches
# on content signals: identical photo, near-identical address text, or
# near-identical title — same city is required as a first, cheap filter.
# One side effect (expected, not a bug): a two-sided/double-faced board
# that got scraped once per face usually shares the same address+name
# across sources, so this also collapses those down to a single row —
# which is fine, since it's one physical structure either way.
# First-seen item in a matching group wins — same policy as dedup().
_ADDRESS_NOISE_WORDS = [
    "خیابان", "بلوار", "میدان", "کوچه", "پلاک", "طبقه",
    "نبش", "جنب", "روبروی", "نرسیده به", "کوی",
]

def normalize_address(text: str | None) -> str:
    """Lowercases, strips punctuation/common Persian address filler
    words and collapses whitespace, so two addresses written with
    slightly different wording/spacing still compare equal."""
    if not text:
        return ""
    t = text.strip()
    fa_digits = "۰۱۲۳۴۵۶۷۸۹"
    for i, c in enumerate(fa_digits):
        t = t.replace(c, str(i))
    t = re.sub(r"[،,.\-–—()]", " ", t)
    for w in _ADDRESS_NOISE_WORDS:
        t = t.replace(w, " ")
    t = re.sub(r"\s+", " ", t).strip().lower()
    return t

def text_similarity(a: str, b: str) -> float:
    """0..1 similarity ratio (stdlib difflib — no new dependency)."""
    if not a or not b:
        return 0.0
    import difflib
    return difflib.SequenceMatcher(None, a, b).ratio()

def _image_file_hash(web_path: str, cache: dict[str, str | None]) -> str | None:
    """md5 of the actual downloaded image bytes (exact-duplicate photo
    detection). Cached per filename since the same run can reference
    the same file many times."""
    fname = Path(web_path).name
    if fname not in cache:
        fpath = IMAGE_DIR / fname
        try:
            cache[fname] = hashlib.md5(fpath.read_bytes()).hexdigest()
        except Exception:
            cache[fname] = None
    return cache[fname]

def _image_hashes(item: dict, cache: dict[str, str | None]) -> set[str]:
    return {
        h for p in item.get("images", [])
        if (h := _image_file_hash(p, cache)) is not None
    }

ADDRESS_SIMILARITY_THRESHOLD = 0.82
NAME_SIMILARITY_THRESHOLD = 0.88

def cross_source_dedup(items: list[dict]) -> list[dict]:
    kept: list[dict] = []
    image_hash_cache: dict[str, str | None] = {}

    for item in items:
        is_dup = False
        item_addr = item_name = None  # computed lazily, only if needed
        item_imgs: set[str] | None = None

        for existing in kept:
            if item.get("source") == existing.get("source"):
                continue  # same-source dupes are dedup()'s job, not ours
            if item.get("city") != existing.get("city"):
                continue  # cheap filter before any string/image work

            # Strongest signal: byte-identical photo re-uploaded elsewhere.
            if item_imgs is None:
                item_imgs = _image_hashes(item, image_hash_cache)
            if item_imgs and (item_imgs & _image_hashes(existing, image_hash_cache)):
                is_dup = True
                break

            if item_addr is None:
                item_addr = normalize_address(item.get("location"))
            existing_addr = normalize_address(existing.get("location"))
            addr_sim = text_similarity(item_addr, existing_addr)
            if addr_sim >= ADDRESS_SIMILARITY_THRESHOLD:
                is_dup = True
                break

            if item_name is None:
                item_name = normalize_address(item.get("name"))
            existing_name = normalize_address(existing.get("name"))
            name_sim = text_similarity(item_name, existing_name)
            # Matching titles alone are common (many ads just say "بیلبورد
            # اجاره تهران") — only trust it once the address is at least
            # loosely related too, to avoid false positives.
            if name_sim >= NAME_SIMILARITY_THRESHOLD and addr_sim >= 0.6:
                is_dup = True
                break

        if not is_dup:
            kept.append(item)
    return kept

def dedup(items: list[dict]) -> list[dict]:
    seen = set()
    out  = []
    for item in items:
        key = item["id"]
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out

# ── Automatic cleanup of stale / no-longer-existing listings ────
# ── Geocoding (address -> lat/lng) ────────────────────────────────
# V4 is the confirmed-working endpoint. V5 and V6 return incorrect results or 404.
NESHAN_GEOCODE_V6 = "https://api.neshan.org/v4/geocoding"   # primary (confirmed working)
NESHAN_GEOCODE_V5 = "https://api.neshan.org/v4/geocoding"   # same — v5/v6 return 404
# Load .env.local from project root (one level above scraper/)
_env_file = Path(__file__).parent.parent / ".env.local"
if _env_file.exists():
    for _line in _env_file.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip().strip(chr(34) + chr(39)))

NESHAN_API_KEY = os.environ.get("NESHAN_API_KEY", "")
GEOCODE_SLEEP = 0.2
GEOCODE_TIMEOUT = 8  # was 5 — a bit more slack for occasional Iranian domestic latency spikes

def load_geocode_cache() -> dict:
    if GEOCODE_CACHE_FILE.exists():
        try:
            return json.loads(GEOCODE_CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}

def save_geocode_cache(cache: dict) -> None:
    GEOCODE_CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")

class GeocodeNetworkError(Exception):
    pass

def _neshan_reachable() -> bool:
    if not NESHAN_API_KEY:
        print("📍 ⚠ NESHAN_API_KEY is not set. Skipping geocoding.")
        print("   Get a free key at https://platform.neshan.org and set:")
        print("   export NESHAN_API_KEY=\"service.xxx.yyy\"")
        return False
    try:
        resp = fetch_with_retry(
            requests, "GET", NESHAN_GEOCODE_V6,
            params={"address": "تهران"},
            headers={"Api-Key": NESHAN_API_KEY},
            timeout=GEOCODE_TIMEOUT,
            max_retries=2,
        )
        resp.raise_for_status()
        return True
    except Exception:
        return False

# Approximate city centers used as search bias for Neshan API.
# Without this, Neshan defaults to Tehran and returns wrong results for other cities.
_CITY_CENTERS: dict[str, tuple[str, str]] = {
    "تهران":      ("35.6892", "51.3890"),
    "کرج":        ("35.8400", "50.9391"),
    "اصفهان":     ("32.6539", "51.6660"),
    "مشهد":       ("36.2972", "59.6067"),
    "شیراز":      ("29.5917", "52.5836"),
    "تبریز":      ("38.0800", "46.2919"),
    "اهواز":      ("31.3183", "48.6706"),
    "قم":         ("34.6416", "50.8746"),
    "کرمانشاه":   ("34.3142", "47.0650"),
    "رشت":        ("37.2809", "49.5832"),
    "زنجان":      ("36.6736", "48.4787"),
    "یزد":        ("31.8974", "54.3569"),
    "ارومیه":     ("37.5527", "45.0761"),
    "کرمان":      ("30.2839", "57.0834"),
    "همدان":      ("34.7990", "48.5147"),
    "اراک":       ("34.0954", "49.7092"),
    "بندرعباس":   ("27.1832", "56.2666"),
    "ساری":       ("36.5633", "53.0601"),
    "قزوین":      ("36.2688", "50.0041"),
    "سنندج":      ("35.3219", "46.9861"),
    "اردبیل":     ("38.2498", "48.2933"),
    "گرگان":      ("36.8428", "54.4439"),
    "خرم‌آباد":   ("33.4878", "48.3558"),
    "زاهدان":     ("29.4963", "60.8629"),
    "بوشهر":      ("28.9684", "50.8385"),
    "سمنان":      ("35.5729", "53.3970"),
    "یاسوج":      ("30.6682", "51.5879"),
    "ایلام":      ("33.6374", "46.4227"),
    "بیرجند":     ("32.8663", "59.2211"),
    "شهرکرد":     ("32.3256", "50.8644"),
    "بجنورد":     ("37.4747", "57.3290"),
}

def geocode_address(address: str, city: str) -> tuple[float, float] | None:
    """
    Geocode using Neshan v6/geocoding, with v5 as emergency fallback.
    Both endpoints share the same response format (location.x / location.y).
    Original scraped address/location/region fields are NEVER modified here.

    City center bias is sent to BOTH v6 and v5 — without it, Neshan defaults
    to Tehran for all addresses regardless of the stated city.
    """
    full_address = f"{address}، {city}" if city else address
    clat, clng = _CITY_CENTERS.get(city, ("35.6892", "51.389"))

    endpoints = [
        # V6: send lat/lng as bias — improves precision for non-Tehran cities
        (NESHAN_GEOCODE_V6, {"address": full_address, "lat": clat, "lng": clng}),
        # V5: emergency fallback, same params
        (NESHAN_GEOCODE_V5, {"address": full_address, "lat": clat, "lng": clng}),
    ]
    for url, params in endpoints:
        try:
            resp = fetch_with_retry(
                requests, "GET", url,
                params=params,
                headers={"Api-Key": NESHAN_API_KEY},
                timeout=GEOCODE_TIMEOUT,
                max_retries=2,
            )
            if resp.status_code == 200:
                data = resp.json()
                loc  = data.get("location", {})
                lat  = loc.get("y") or loc.get("lat")
                lng  = loc.get("x") or loc.get("lng")
                if lat and lng:
                    return float(lat), float(lng)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            if url == NESHAN_GEOCODE_V6:
                print(f"    ⚠ v6 unreachable, falling back to v5...")
                continue
            raise GeocodeNetworkError(str(e))
        except Exception as e:
            print(f"    ⚠ geocode error for '{address[:40]}': {e}")
    return None

def _coords_plausible(lat: float, lng: float, city: str) -> bool:
    """Returns False if the coordinate is more than ~60km from the expected city center.
    Tightened from 150km — Neshan often resolves vague addresses (e.g. 'میدان انقلاب')
    to the wrong city, returning plausible-looking but incorrect coordinates."""
    import math
    center = _CITY_CENTERS.get(city)
    if not center:
        return True  # unknown city — accept anything
    clat, clng = float(center[0]), float(center[1])
    # Rough haversine approximation (degrees -> km)
    dlat = (lat - clat) * 111.0
    dlng = (lng - clng) * 111.0 * math.cos(math.radians(clat))
    dist_km = math.sqrt(dlat**2 + dlng**2)
    return dist_km < 60

def geocode_missing_coords(items: list[dict]) -> list[dict]:
    """
    Fills in lat/lng for listings that don't have them yet.
    Cache-first: addresses resolved in previous runs cost zero network requests.
    """
    cache = load_geocode_cache()
    to_geocode = [
        item for item in items
        if not (item.get("lat") and item.get("lng"))
        and item.get("location")
    ]

    if not to_geocode:
        return items

    uncached = []
    cache_hits = 0
    for item in to_geocode:
        key = item["location"].strip()
        if key in cache:
            coords = cache[key]
            if coords:
                lat_c, lng_c = coords["lat"], coords["lng"]
                if _coords_plausible(lat_c, lng_c, item.get("city", "")):
                    item["lat"], item["lng"] = lat_c, lng_c
                else:
                    # Cached coords are implausible for this city — re-geocode
                    del cache[key]
                    uncached.append(item)
                    continue
            cache_hits += 1
        else:
            uncached.append(item)

    if cache_hits:
        print(f"📍 {cache_hits} coordinates loaded from cache.")

    if not uncached:
        print("📍 All coordinates resolved from cache — no network requests needed.")
        return items

    print(f"\n📍 Geocoding {len(uncached)} new address(es) — probing Neshan...")
    if not _neshan_reachable():
        print(
            f"📍 ⚠ Neshan is unreachable right now.\n"
            f"   Skipping {len(uncached)} address(es) — they will be retried on the next run.\n"
            f"   (City-level fallback coordinates will be used in the UI in the meantime.)"
        )
        return items

    print(f"📍 Neshan reachable. Processing {len(uncached)} address(es)...")
    total = len(uncached)
    new_lookups = 0
    network_failures = 0

    for i, item in enumerate(uncached, 1):
        cache_key = item["location"].strip()
        city = item.get("city", "")

        # If location is just the city name (no street info), use city center directly.
        # Sending "تهران، تهران" to Neshan wastes an API call and returns a wrong fallback.
        loc_stripped = cache_key.strip()
        if loc_stripped == city and city in _CITY_CENTERS:
            clat, clng = _CITY_CENTERS[city]
            lat, lng = float(clat), float(clng)
            item["lat"], item["lng"] = lat, lng
            cache[cache_key] = {"lat": lat, "lng": lng}
            print(f"    [{i}/{total}] ⚡ {city} → city center ({lat:.4f}, {lng:.4f})")
            new_lookups += 1
            if new_lookups % 20 == 0:
                save_geocode_cache(cache)
            continue

        try:
            coords = geocode_address(item["location"], city)
        except GeocodeNetworkError:
            network_failures += 1
            if network_failures == 1:
                print(f"    [{i}/{total}] ⚠ Neshan became unreachable mid-run — stopping geocoding early.")
                print(f"    Remaining {total - i + 1} address(es) will be retried next run.")
            break

        new_lookups += 1

        if coords:
            lat, lng = coords
            if _coords_plausible(lat, lng, item.get("city", "")):
                item["lat"], item["lng"] = lat, lng
                cache[cache_key] = {"lat": lat, "lng": lng}
                print(f"    [{i}/{total}] ✓ {item['location'][:50]} -> {lat:.4f}, {lng:.4f}")
            else:
                print(f"    [{i}/{total}] ⚠ implausible coords for {item.get('city','?')} — skipped: {lat:.4f}, {lng:.4f}")
        else:
            cache[cache_key] = None
            print(f"    [{i}/{total}] ✗ {item['location'][:50]} -> not found")

        if new_lookups % 20 == 0:
            save_geocode_cache(cache)

        time.sleep(GEOCODE_SLEEP)

    save_geocode_cache(cache)
    found = sum(1 for item in uncached[:new_lookups] if item.get("lat"))
    skipped = total - new_lookups
    msg = f"📍 Geocoding done: {found}/{new_lookups} resolved from {new_lookups} attempted"
    if skipped:
        msg += f", {skipped} skipped (service went offline mid-run — will retry next run)"
    print(msg)
    return items


def apply_grace_period_and_cleanup(current_raw: list[dict], existing_files: set[str]) -> list[dict]:
    """
    Compares this run's live results against the last run's state.
    Listings never permanently deleted — missing ones are marked inactive.

    existing_files: pre-built set of IMAGE_DIR filenames — avoids
    per-path stat() calls inside the loop over thousands of entries.
    """
    previous_state: dict[str, dict] = {}
    if STATE_FILE.exists():
        try:
            previous_state = {e["id"]: e for e in json.loads(STATE_FILE.read_text(encoding="utf-8"))}
        except Exception:
            previous_state = {}

    MIN_RATIO = 0.25
    if previous_state and len(current_raw) < len(previous_state) * MIN_RATIO:
        print(f"\n  🛡  Safety guard triggered!")
        print(f"     Fresh: {len(current_raw)} listings vs Previous: {len(previous_state)}")
        print(f"     Looks like a failed/partial scrape (VPN? network down?).")
        print(f"     Skipping ALL miss-count updates — no status changes, no data lost.")
        merged = {**previous_state}
        for item in current_raw:
            merged[item["id"]] = {**item, "missCount": 0}
        STATE_FILE.write_text(
            json.dumps(list(merged.values()), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return list(merged.values())

    current_ids = {item["id"] for item in current_raw}
    new_state: dict[str, dict] = {}

    for item in current_raw:
        prev = previous_state.get(item["id"], {})
        entry = {**item, "missCount": 0}
        if prev.get("status") == "inactive":
            entry["status"] = item.get("status", "available")
            print(f"  ♻️  reactivated: {item['id']} ({item['name'][:40]})")
        new_state[item["id"]] = entry

    newly_inactive = 0
    for old_id, old_entry in previous_state.items():
        if old_id in current_ids:
            continue

        miss = old_entry.get("missCount", 0) + 1
        old_entry["missCount"] = miss

        # Filter image paths using the pre-built set — O(1) per path
        # instead of fpath.exists() (a stat() syscall) per path.
        old_entry["images"] = [
            p for p in old_entry.get("images", [])
            if Path(p).name in existing_files
        ]

        if miss > MAX_MISSED_RUNS and old_entry.get("status") != "inactive":
            old_entry["status"] = "inactive"
            newly_inactive += 1

        new_state[old_id] = old_entry

    STATE_FILE.write_text(json.dumps(list(new_state.values()), ensure_ascii=False, indent=2), encoding="utf-8")

    if newly_inactive:
        print(f"  ℹ️  {newly_inactive} listing(s) marked inactive (not seen for {MAX_MISSED_RUNS}+ runs — data preserved)")

    return list(new_state.values())

# ── Convert to Rasamap format ────────────────────────────────────
_stable_id_seen: set[int] = set()  # collision guard — cleared before each format pass

def to_rasamap_format(raw: dict, index: int) -> dict:
    price = raw["price"]
    # Use MD5 of raw["id"] — gives a full 32-char hex, stable across runs.
    full_hex = hashlib.md5(raw["id"].encode()).hexdigest()
    # Try successive 8-char windows until we find an unused ID (handles rare collisions).
    for offset in range(0, 25, 8):
        _hex_src = full_hex[offset:offset + 8]
        stable_id = int(_hex_src, 16) % 90_000_000 + 1_000_000  # range: 1M–91M
        if stable_id not in _stable_id_seen:
            break
    _stable_id_seen.add(stable_id)
    out = {
        "id": stable_id,
        "name": raw["name"],
        "slug": f"scraped-{raw['id']}",
        "location": raw["location"],
        "region": raw["region"],
        "city": raw.get("city", "تهران"),
        "type": raw["type"],
        "status": raw["status"],
        "width": raw.get("_widthRaw") or random.choice([8, 10, 12, 14, 16]),
        "height": raw.get("_heightRaw") or random.choice([3, 4, 4.5, 5]),
        "faces": random.choice([1, 2, 2, 4]),
        "age": random.randint(1, 15),
        "price": price,
        "priceWeekly": round(price / 4),
        "priceQuarterly": round(price * 3 * 0.9),
        "priceYearly": round(price * 12 * 0.8),
        "traffic": raw["traffic"],
        "mapX": random.uniform(5, 95),
        "mapY": random.uniform(5, 90),
        "icon": {"billboard": "🏙️", "digital": "📺", "bridge": "🌉", "station": "🚇"}.get(raw["type"], "📋"),
        "images": raw.get("images", []),
        "agency": raw.get("agency") or "اجاره‌دهنده مستقیم",
        "phone": raw.get("phone") or "",
        "description": raw["name"],
        "features": [],
        "nearbyLandmarks": [],
        "rating": round(random.uniform(3.8, 5.0), 1),
        "reviewCount": random.randint(1, 40),
        "source": raw.get("source", "manual"),
        "scrapedAt": raw.get("scrapedAt"),
    }
    if raw.get("lat") and raw.get("lng"):
        out["lat"] = raw["lat"]
        out["lng"] = raw["lng"]
    return out

# ── Scraping target registry ─────────────────────────────────────
# divar و sheypoor حذف شدن — این دو سایت آگهی‌های غیر‌بیلبورد (نقاشی، دکوری) هم برمی‌گردوندن
# و هیچ داده قابل استفاده‌ای نسبت به سایت‌های تخصصی بیلبورد نداشتن.
SOURCES = [
    {"key": "billboardiha", "label": "Billboardiha.com",   "fn": None},  # fn set in main()
    {"key": "irbillboard",  "label": "IRBillboard.com",    "fn": None},
    {"key": "aradholding",  "label": "Aradholding.com",    "fn": lambda: scrape_aradholding()},
]

MEDIA_TYPES = [
    {"key": "billboard", "label": "Billboard"},
    {"key": "digital",   "label": "Digital / LED"},
    {"key": "bridge",    "label": "Bridge"},
    {"key": "station",   "label": "Station / Metro"},
]


def _pick(prompt_header: str, options: list[dict]) -> list[str]:
    print(f"\n{prompt_header}")
    print("─" * 45)
    for i, opt in enumerate(options, 1):
        print(f"  {i}. {opt['label']}")
    print("─" * 45)
    print("  a. All")
    print("  0. Cancel / Exit")
    print()

    raw = input("Select (e.g. 1,3 or 1-3 or a): ").strip().lower()

    if not raw or raw in ("0", "q", "quit", "exit"):
        return []
    if raw in ("a", "all", "همه"):
        return [o["key"] for o in options]

    selected_keys: list[str] = []
    for part in raw.replace(" ", "").split(","):
        if "-" in part:
            try:
                lo, hi = part.split("-", 1)
                for idx in range(int(lo), int(hi) + 1):
                    if 1 <= idx <= len(options):
                        selected_keys.append(options[idx - 1]["key"])
            except ValueError:
                print(f"  ⚠ نادیده گرفته شد: '{part}'")
        else:
            try:
                idx = int(part)
                if 1 <= idx <= len(options):
                    selected_keys.append(options[idx - 1]["key"])
                else:
                    print(f"  ⚠ عدد خارج از محدوده: {idx}")
            except ValueError:
                print(f"  ⚠ نادیده گرفته شد: '{part}'")

    seen: set[str] = set()
    return [k for k in selected_keys if not (k in seen or seen.add(k))]  # type: ignore[func-returns-value]


def select_targets() -> tuple[list[dict], set[str]]:
    print("\n" + "═" * 45)
    print("  🎯  انتخاب منابع و نوع رسانه")
    print("═" * 45)

    source_keys = _pick("📡  Which sources to scrape?", SOURCES)
    if not source_keys:
        print("\n  ❌  هیچ منبعی انتخاب نشد. خروج.\n")
        raise SystemExit(0)

    chosen_sources = [s for s in SOURCES if s["key"] in source_keys]
    print(f"\n  ✓ Sources selected: {', '.join(s['label'] for s in chosen_sources)}")

    type_keys = _pick("📋  Which media types?", MEDIA_TYPES)
    if not type_keys:
        print("\n  ❌  هیچ نوع رسانه‌ای انتخاب نشد. خروج.\n")
        raise SystemExit(0)

    chosen_type_labels = [m["label"] for m in MEDIA_TYPES if m["key"] in type_keys]
    print(f"\n  ✓ Media types: {', '.join(chosen_type_labels)}")
    print()

    return chosen_sources, set(type_keys)


CHECKPOINT_FILE = OUTPUT_DIR / "checkpoint_raw.json"


def preflight_check() -> None:
    """
    Quick reachability probe before a multi-hour scrape run.
    Every source here (and Neshan) is an Iranian domestic site/API — their
    WAFs (Arvancloud, Cloudflare-IR edge, etc.) commonly block or heavily
    challenge foreign/VPN/datacenter IP ranges. So the rule is simple:
    VPN OFF for the entire run, not just for Neshan.
    """
    print("\n🔎 پیش‌بررسی اتصال (فیلترشکن باید کاملاً خاموش باشد)...")
    targets = [
        ("divar.ir", "https://divar.ir"),
        ("sheypoor.com", "https://www.sheypoor.com"),
        ("billboardiha.com", "https://billboardiha.com"),
        ("irbillboard.com", "https://irbillboard.com"),
        ("aradholding.com", "https://aradholding.com"),
        ("Neshan API", "https://api.neshan.org"),
    ]
    failures = []
    for name, url in targets:
        try:
            r = fetch_with_retry(requests, "GET", url, headers=_stealth_headers(), timeout=6, max_retries=1)
            ok = r.status_code < 500
            print(f"   {'✓' if ok else '✗'} {name} — HTTP {r.status_code}")
            if not ok:
                failures.append(name)
        except Exception as e:
            print(f"   ✗ {name} — غیرقابل‌دسترس ({type(e).__name__})")
            failures.append(name)

    if len(failures) >= len(targets) - 1:
        print("\n   ⚠️  اکثر منابع غیرقابل‌دسترسند.")
        print("      → مطمئن شو فیلترشکن کاملاً خاموش است. همه‌ی این سایت‌ها ایرانی‌اند")
        print("        و WAF بعضی‌هاشون (مثل آروان‌کلود) ترافیک VPN/خارجی را مسدود می‌کند.")
    elif failures:
        print(f"\n   ℹ️  {len(failures)} منبع موقتاً در دسترس نبود — احتمالاً گذراست، ادامه می‌دهیم.")
    print()


# ── Main ─────────────────────────────────────────────────────────
def main():
    import sys
    bih_only   = "--bih-only" in sys.argv
    fresh_mode = "--fresh"    in sys.argv

    # ── Startup banner ────────────────────────────────────────────
    W = 62
    mode_label  = "حالت: تازه (Fresh) — داده‌های قبلی پاک می‌شوند" if fresh_mode else "حالت: افزایشی (Incremental) — داده‌های موجود دست‌نخورده"
    src_label   = "منبع: فقط Billboardiha.com" if bih_only else "منبع: همه منابع"
    fresh_hint  = "برای حذف داده‌های قبلی و اسکرپ کامل مجدد:"
    fresh_cmd   = "  python scraper.py --fresh" + (" --bih-only" if bih_only else "")
    print("╔" + "═" * W + "╗")
    print("║" + "  Rasamap Scraper v2.3".center(W) + "║")
    print("║" + "─" * W + "║")
    print("║" + f"  {mode_label}".ljust(W) + "║")
    print("║" + f"  {src_label}".ljust(W) + "║")
    if not fresh_mode:
        print("║" + " " * W + "║")
        print("║" + f"  {fresh_hint}".ljust(W) + "║")
        print("║" + f"{fresh_cmd}".ljust(W + 2) + "║")
    print("╚" + "═" * W + "╝")
    print()

    if bih_only:
        # ── billboardiha-only mode ────────────────────────────────
        # Runs only billboardiha, merges result into existing billboards.json.
        # Other sources (irbillboard, aradholding, static) are left untouched.
        # No geocoding, no interactive prompts, no Neshan calls.
        print("\n  ⚡  --bih-only: فقط billboardiha اسکرپ می‌شود (منابع دیگر دست‌نخورده می‌مانند)")

        if fresh_mode:
            # Clear only billboardiha images (bih-* prefix), not other sources
            bih_img_count = 0
            for img in IMAGE_DIR.glob("bih-*"):
                try:
                    img.unlink()
                    bih_img_count += 1
                except OSError:
                    pass
            print(f"     deleted {bih_img_count} old billboardiha images")

            # Clear billboardiha state so it does a full re-fetch
            bih_state = OUTPUT_DIR / "scrape_state.json"
            if bih_state.exists():
                bih_state.unlink()
                print(f"     deleted scrape_state.json")
            print()
        else:
            print("     داده‌های موجود billboardiha دست‌نخورده می‌مانند — فقط آیتم‌های جدید اضافه می‌شوند")
            print()

        existing_files: set[str] = {f.name for f in IMAGE_DIR.iterdir() if f.is_file()}

        print(f"\n{'═' * 50}\n  ▶ Billboardiha.com\n{'═' * 50}")
        bih_raw = scrape_billboardiha(fresh_start=fresh_mode)
        print(f"  billboardiha: {len(bih_raw)} listings")

        existing_files = {f.name for f in IMAGE_DIR.iterdir() if f.is_file()}

        # Strip broken image paths
        for item in bih_raw:
            item["images"] = [
                p for p in item.get("images", [])
                if Path(p).name in existing_files
            ]

        # Format billboardiha records
        _stable_id_seen.clear()
        # Load existing formatted data to reserve their stable IDs first
        existing_formatted = []
        if OUTPUT_FILE.exists():
            try:
                existing_formatted = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
            except Exception:
                pass
        # Register existing non-billboardiha IDs so hash collision guard works
        for r in existing_formatted:
            if r.get("source") != "billboardiha":
                _stable_id_seen.add(r["id"])

        new_bih_formatted = [to_rasamap_format(r, i) for i, r in enumerate(bih_raw)]

        # Merge: keep non-billboardiha records, replace billboardiha
        merged = [r for r in existing_formatted if r.get("source") != "billboardiha"]
        merged += new_bih_formatted

        RAW_DEBUG_FILE.write_text(json.dumps(bih_raw, ensure_ascii=False, indent=2), encoding="utf-8")
        OUTPUT_FILE.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")

        print(f"\n✅ Done!")
        print(f"   billboardiha: {len(new_bih_formatted)} listings")
        print(f"   total (merged): {len(merged)}")
        print(f"   Saved to: {OUTPUT_FILE}")
        print(f"\n   بعدی: npm run db:seed")
        return

    # ── Full scrape mode ──────────────────────────────────────────
    if fresh_mode:
        print("\n  🔄  --fresh mode: clearing previous state for a clean rescrape")
        for f in [STATE_FILE, GEOCODE_CACHE_FILE, RAW_DEBUG_FILE, CHECKPOINT_FILE]:
            if f.exists():
                f.unlink()
                print(f"     deleted: {f.name}")
        # Also clear downloaded images so no stale files remain
        img_count = 0
        for img in IMAGE_DIR.glob("*"):
            try:
                img.unlink()
                img_count += 1
            except OSError:
                pass
        print(f"     deleted {img_count} cached images from public/images/scraped/")
        print()

    preflight_check()

    chosen_sources, chosen_types = select_targets()

    # Build existing-files set once here, shared across all scrapers.
    # Avoids thousands of per-file stat() calls inside hot loops.
    existing_files = {f.name for f in IMAGE_DIR.iterdir() if f.is_file()}

    # Wire up closures now that existing_files is ready.
    for src in SOURCES:
        if src["key"] == "billboardiha":
            src["fn"] = lambda fm=fresh_mode: scrape_billboardiha(fresh_start=fm)
        elif src["key"] == "irbillboard":
            src["fn"] = lambda ef=existing_files: scrape_irbillboard(ef)

    fresh_raw = []
    for src in chosen_sources:
        print(f"\n{'═' * 50}\n  ▶ {src['label']}\n{'═' * 50}")
        try:
            source_results = src["fn"]()
        except Exception as e:
            print(f"\n  ✗✗ {src['label']} crashed unexpectedly: {e}")
            print(f"     Continuing with remaining sources — nothing scraped so far is lost.")
            source_results = []
        fresh_raw += source_results

        # Checkpoint after every source.
        try:
            CHECKPOINT_FILE.write_text(json.dumps(fresh_raw, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  💾 checkpoint saved ({len(fresh_raw)} items so far)")
        except Exception:
            pass

    fresh_raw = cross_source_dedup(fresh_raw)
    fresh_raw = dedup(fresh_raw)

    if chosen_types != {m["key"] for m in MEDIA_TYPES}:
        before = len(fresh_raw)
        fresh_raw = [r for r in fresh_raw if r.get("type") in chosen_types]
        print(f"\n  🔍 نوع رسانه filter: {before} → {len(fresh_raw)} آیتم")

    # Rebuild existing_files from disk
    existing_files = {f.name for f in IMAGE_DIR.iterdir() if f.is_file()}

    kept_raw = apply_grace_period_and_cleanup(fresh_raw, existing_files)

    kept_raw = geocode_missing_coords(kept_raw)

    # Final guard: strip image paths whose files no longer exist.
    for item in kept_raw:
        item["images"] = [
            p for p in item.get("images", [])
            if Path(p).name in existing_files
        ]

    _stable_id_seen.clear()
    formatted = [to_rasamap_format(r, i) for i, r in enumerate(kept_raw)]

    RAW_DEBUG_FILE.write_text(json.dumps(kept_raw, ensure_ascii=False, indent=2), encoding="utf-8")
    OUTPUT_FILE.write_text(json.dumps(formatted, ensure_ascii=False, indent=2), encoding="utf-8")

    # Run finished cleanly — the crash-recovery checkpoint is no longer needed.
    if CHECKPOINT_FILE.exists():
        CHECKPOINT_FILE.unlink()

    print(f"\n✅ Done!")
    print(f"   Active listings: {len(formatted)}")
    print(f"   Saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()