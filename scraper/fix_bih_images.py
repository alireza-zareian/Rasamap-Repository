#!/usr/bin/env python3
"""
Fix missing images for billboardiha records using raw_latest.json (which has URLs).

Strategy: for each bih record with no image, try the canonical direct URL
  /_container/billboard/{raw_id}/main.jpg   (and .png, .jpeg variants)
If that 404s, the listing genuinely has no photo uploaded on billboardiha.com.

Usage:
  cd scraper && python3 fix_bih_images.py
Then:
  cd .. && npm run db:seed
"""

import json, re, time, random, os, sys
from pathlib import Path
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print("pip install requests"); sys.exit(1)

from image_utils import existing_variant, save_optimized

BASE_URL         = "https://billboardiha.com"
IMAGE_DIR        = Path(__file__).parent.parent / "public" / "images" / "scraped"
IMAGE_WEB_PREFIX = "/images/scraped"
OUTPUT_FILE      = Path(__file__).parent / "data" / "billboards.json"
RAW_FILE         = Path(__file__).parent / "data" / "raw_latest.json"
MIN_IMAGE_BYTES  = 10_000

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
    "Referer": BASE_URL + "/",
}
SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def try_download(url: str, fpath: Path) -> str | None:
    """Fetch `url`; on success write it (opaque PNG -> JPEG) and return the
    final filename, else None."""
    try:
        resp = SESSION.get(url, timeout=10, stream=True)
        if resp.status_code != 200:
            return None
        data = resp.content
        if len(data) < MIN_IMAGE_BYTES:
            return None
        return save_optimized(data, fpath)
    except Exception:
        return None


def attempt_image(raw_id: str, uid: str, existing_files: set) -> str | None:
    """Try known URL formats for raw_id. Return web path on success, None otherwise."""
    have = existing_variant(existing_files, f"{uid}_0")
    if have:
        return f"{IMAGE_WEB_PREFIX}/{have}"
    first_part = raw_id.split("-")[0] if "-" in raw_id else raw_id
    ids_to_try = list(dict.fromkeys([raw_id, first_part]))
    for rid in ids_to_try:
        for ext in (".jpg", ".png", ".jpeg"):
            url = f"{BASE_URL}/_container/billboard/{rid}/main{ext}"
            final = try_download(url, IMAGE_DIR / f"{uid}_0{ext}")
            if final:
                existing_files.add(final)
                time.sleep(random.uniform(0.15, 0.35))
                return f"{IMAGE_WEB_PREFIX}/{final}"
    return None


def main():
    if not RAW_FILE.exists():
        print("raw_latest.json not found — run scraper.py first"); sys.exit(1)

    raw_records = json.loads(RAW_FILE.read_text(encoding="utf-8"))
    formatted   = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
    existing_files = {f.name for f in IMAGE_DIR.iterdir() if f.is_file()}

    # Build lookup: raw uid → raw record (has URL)
    raw_by_uid = {r["id"]: r for r in raw_records if r.get("source") == "billboardiha"}

    missing = [r for r in formatted if r.get("source") == "billboardiha" and not r.get("images")]
    total = len(missing)
    print(f"Found {total} billboardiha records with no images")

    fixed = 0
    truly_missing = 0
    for i, fmt_rec in enumerate(missing, 1):
        slug = fmt_rec.get("slug", "")  # e.g. "scraped-bih-30d57c31"
        uid = slug.replace("scraped-", "") if slug.startswith("scraped-") else ""
        raw = raw_by_uid.get(uid)
        if not raw:
            truly_missing += 1
            continue

        url = raw.get("url", "")
        m = re.search(r"/billboard/([^/]+)/", url)
        if not m:
            truly_missing += 1
            continue
        raw_id = m.group(1)

        web_path = attempt_image(raw_id, uid, existing_files)
        if web_path:
            fmt_rec["images"] = [web_path]
            fixed += 1
            if i <= 5 or i % 100 == 0:
                print(f"  [{i}/{total}] ✓ {fmt_rec.get('name','')[:40]}")
        else:
            truly_missing += 1
            if i <= 20 or i % 200 == 0:
                print(f"  [{i}/{total}] ✗ no image on site: {fmt_rec.get('name','')[:40]}")

    OUTPUT_FILE.write_text(json.dumps(formatted, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone. Fixed {fixed}/{total} — {truly_missing} have no photo on billboardiha.com.")
    print("Run: cd .. && npm run db:seed")


if __name__ == "__main__":
    main()
