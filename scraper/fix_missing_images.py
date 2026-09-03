#!/usr/bin/env python3
"""
fix_missing_images.py — Rasamap
================================
Fills in missing images for billboardiha listings by constructing the image URL
directly from the raw_id embedded in each listing's URL.

Pattern confirmed:  https://billboardiha.com/_container/billboard/{raw_id}/main.jpg
Real images: ~48-50 KB   |   Placeholders: ~3.4 KB (rejected)

Usage:
    python scraper/fix_missing_images.py [--dry-run] [--limit N]
"""

import json
import os
import re
import sys
import time
import random
import hashlib
from pathlib import Path

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    print("pip install requests")
    sys.exit(1)

from image_utils import existing_variant, save_optimized

# ── Config ───────────────────────────────────────────────────────────────────
BASE_URL          = "https://billboardiha.com"
IMAGE_DIR         = Path(__file__).parent.parent / "public" / "images" / "scraped"
IMAGE_WEB_PREFIX  = "/images/scraped"
MIN_IMAGE_BYTES   = 10_000   # < 10 KB → placeholder, skip
SLEEP_MIN, SLEEP_MAX = 0.4, 0.9

RAW_FILE      = Path(__file__).parent / "data" / "raw_latest.json"
OUTPUT_FILE   = Path(__file__).parent / "data" / "billboards.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer": "https://billboardiha.com/",
}

# ─────────────────────────────────────────────────────────────────────────────

def make_uid(raw_id: str) -> str:
    return "bih-" + hashlib.md5(("billboardiha-" + raw_id).encode()).hexdigest()[:8]


def try_download(raw_id: str, uid: str, existing_files: set[str], dry_run: bool) -> list[str]:
    """Try to download main.jpg for a listing. Returns list of saved web paths."""
    img_url = f"{BASE_URL}/_container/billboard/{raw_id}/main.jpg"
    stem    = f"{uid}_0"

    have = existing_variant(existing_files, stem)
    if have:
        return [f"{IMAGE_WEB_PREFIX}/{have}"]   # already on disk, any extension

    if dry_run:
        return [f"[dry-run] {IMAGE_WEB_PREFIX}/{stem}.jpg"]

    try:
        resp = requests.get(img_url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        data = resp.content
        if len(data) < MIN_IMAGE_BYTES:
            return []   # placeholder
        fname = save_optimized(data, IMAGE_DIR / f"{stem}.jpg")  # opaque PNG -> JPEG
        existing_files.add(fname)
        time.sleep(random.uniform(SLEEP_MIN, SLEEP_MAX))
        return [f"{IMAGE_WEB_PREFIX}/{fname}"]
    except Exception as e:
        print(f"    [WARN] {raw_id}: {e}")
        return []


def main():
    dry_run = "--dry-run" in sys.argv
    limit   = None
    for i, arg in enumerate(sys.argv):
        if arg == "--limit" and i + 1 < len(sys.argv):
            limit = int(sys.argv[i + 1])

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    existing_files = {f.name for f in IMAGE_DIR.iterdir() if f.is_file()}
    print(f"Existing image files on disk: {len(existing_files)}")

    raw_data  = json.loads(RAW_FILE.read_text(encoding="utf-8"))
    out_data  = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))

    # Build raw lookup by id for quick updates
    raw_by_id = {r["id"]: r for r in raw_data}

    # Build output lookup by slug to find formatted record for each raw record
    # slug pattern: "scraped-{raw_id}" where raw_id = make_uid(actual_raw_id)
    # Actually slug = "scraped-" + raw["id"] where raw["id"] = uid = "bih-xxxxxxxx"
    out_by_slug = {r["slug"]: r for r in out_data}

    # Find raw records without images that have a billboardiha URL
    no_img = [
        r for r in raw_data
        if r.get("source") == "billboardiha"
        and not r.get("images")
        and r.get("url")
        and "/billboard/" in r.get("url", "")
    ]
    print(f"Billboardiha records without images: {len(no_img)}")
    if limit:
        no_img = no_img[:limit]
        print(f"  (limited to {limit})")

    fixed = 0
    skipped = 0
    failed = 0

    for i, raw in enumerate(no_img):
        url    = raw["url"]
        uid    = raw["id"]   # e.g. "bih-953197cd"
        slug   = f"scraped-{uid}"

        m = re.search(r"/billboard/([^/]+)/", url)
        if not m:
            skipped += 1
            continue
        raw_id = m.group(1)   # e.g. "4463-4861"

        if (i + 1) % 100 == 0:
            print(f"  Progress: {i+1}/{len(no_img)}  fixed={fixed}  failed={failed}")

        paths = try_download(raw_id, uid, existing_files, dry_run)
        if paths:
            # Update raw record
            raw_by_id[uid]["images"] = paths
            # Update formatted output record
            if slug in out_by_slug:
                out_by_slug[slug]["images"] = paths
            fixed += 1
        else:
            failed += 1

    print(f"\nDone: fixed={fixed}  no_image={failed}  skipped={skipped}")
    print(f"Disk images now: {len(existing_files)}")

    if not dry_run:
        # Write updated raw data
        RAW_FILE.write_text(
            json.dumps(list(raw_by_id.values()), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        # Write updated formatted output
        OUTPUT_FILE.write_text(
            json.dumps(list(out_by_slug.values()), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print("Updated raw_latest.json and billboards.json")
    else:
        print("[dry-run] No files written.")


if __name__ == "__main__":
    main()
