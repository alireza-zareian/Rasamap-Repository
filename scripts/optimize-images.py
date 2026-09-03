#!/usr/bin/env python3
"""
One-off asset migration: re-encode fully-opaque scraped PNGs as progressive JPEG.

Why: the scraper saved 1563 PNGs (565 MB) for photographic billboard shots.
PNG is a lossless format meant for graphics; for a 500x500 photo it costs ~7x
the bytes of a visually identical JPEG. That weight is paid twice on every
page view - once on the wire, once in the browser's image decoder - which is
what makes a fanless laptop heat up while browsing the grid.

Safety rules this script follows:
  - Dimensions are NEVER changed. Only the container/encoding changes, so the
    detail-page lightbox looks exactly as before.
  - PNGs that actually use transparency are left untouched. JPEG has no alpha
    channel, so converting those would paint the transparent areas black.
    Only files whose alpha channel is fully opaque (or absent) are converted.
  - Path references are rewritten from an explicit map of converted files, not
    a blanket ".png" -> ".jpg" replace, so the 231 surviving PNGs keep working.
  - --apply never deletes anything. The original PNGs stay on disk, so the
    migration is reversible until you are happy with the result. Reclaiming
    that disk space is a separate, explicit --delete-originals run, which only
    removes a .png whose .jpg exists and re-opens at identical dimensions.

Everything runs offline with Pillow - no network, no external service.

Usage:
  python3 scripts/optimize-images.py                      # dry run
  python3 scripts/optimize-images.py --apply              # convert + rewrite refs
  python3 scripts/optimize-images.py --delete-originals   # reclaim disk, after checking
"""
import argparse
import glob
import json
import os
import sqlite3
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGE_GLOB = os.path.join(ROOT, "public", "images", "**", "*.png")
JSON_FILES = [
    os.path.join(ROOT, "scraper", "data", "billboards.json"),
    os.path.join(ROOT, "scraper", "data", "raw_latest.json"),
]
DB_FILE = os.path.join(ROOT, "dev.db")
QUALITY = 85


def is_fully_opaque(im):
    """True when the image has no alpha channel, or one that is entirely 255."""
    if im.mode not in ("RGBA", "LA", "PA"):
        return True
    return im.getchannel("A").getextrema()[0] == 255


def convert(png_path):
    """PNG -> progressive JPEG at identical dimensions. Returns (jpg_path, before, after)."""
    jpg_path = png_path[:-4] + ".jpg"
    before = os.path.getsize(png_path)
    with Image.open(png_path) as im:
        size = im.size
        im.convert("RGB").save(
            jpg_path, "JPEG", quality=QUALITY, optimize=True, progressive=True
        )
    # Verify the result before the caller is allowed to delete the original.
    with Image.open(jpg_path) as check:
        if check.size != size:
            os.remove(jpg_path)
            raise RuntimeError(f"size mismatch for {png_path}: {check.size} != {size}")
    return jpg_path, before, os.path.getsize(jpg_path)


def web_path(abs_path):
    """/Users/.../public/images/scraped/x.jpg -> /images/scraped/x.jpg"""
    return "/" + os.path.relpath(abs_path, os.path.join(ROOT, "public")).replace(os.sep, "/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="convert and rewrite references")
    ap.add_argument("--delete-originals", action="store_true",
                    help="reclaim disk by removing PNGs that already have a verified .jpg")
    args = ap.parse_args()

    if args.delete_originals:
        delete_originals()
        return

    dry = not args.apply

    pngs = sorted(glob.glob(IMAGE_GLOB, recursive=True))
    opaque, keep = [], []
    for p in pngs:
        with Image.open(p) as im:
            (opaque if is_fully_opaque(im) else keep).append(p)

    print(f"PNGs found          : {len(pngs)}")
    print(f"  convertible       : {len(opaque)}  ({sum(os.path.getsize(f) for f in opaque)/1048576:.0f} MB)")
    print(f"  keep as PNG (alpha): {len(keep)}  ({sum(os.path.getsize(f) for f in keep)/1048576:.0f} MB)")
    if dry:
        print("\n[dry run] nothing written. Re-run with --apply.")
        return

    # ── 1. Convert ────────────────────────────────────────────────────
    mapping, before_total, after_total, failed = {}, 0, 0, []
    for i, p in enumerate(opaque, 1):
        try:
            jpg, before, after = convert(p)
            mapping[web_path(p)] = web_path(jpg)
            before_total += before
            after_total += after
        except Exception as exc:  # noqa: BLE001 - report and skip, never abort mid-run
            failed.append((p, str(exc)))
        if i % 250 == 0:
            print(f"  converted {i}/{len(opaque)}...")
    print(f"converted {len(mapping)} files: "
          f"{before_total/1048576:.0f} MB -> {after_total/1048576:.0f} MB "
          f"({100 - 100*after_total/max(before_total,1):.0f}% smaller)")
    if failed:
        print(f"  {len(failed)} failed (originals kept):")
        for p, e in failed[:5]:
            print(f"    {os.path.basename(p)}: {e}")

    # ── 2. Rewrite path references from the explicit map ──────────────
    for jf in JSON_FILES:
        if not os.path.exists(jf):
            continue
        text = open(jf, encoding="utf-8").read()
        hits = 0
        for old, new in mapping.items():
            if old in text:
                hits += text.count(old)
                text = text.replace(old, new)
        open(jf, "w", encoding="utf-8").write(text)
        print(f"{os.path.relpath(jf, ROOT)}: rewrote {hits} path(s)")

    con = sqlite3.connect(DB_FILE)
    cur = con.cursor()
    changed = 0
    for rid, images, all_images in cur.execute(
        "SELECT id, images, allImages FROM billboards "
        "WHERE images LIKE '%.png%' OR IFNULL(allImages,'') LIKE '%.png%'"
    ).fetchall():
        new_i, new_a = images, all_images
        for old, new in mapping.items():
            if new_i and old in new_i:
                new_i = new_i.replace(old, new)
            if new_a and old in new_a:
                new_a = new_a.replace(old, new)
        if new_i != images or new_a != all_images:
            cur.execute(
                "UPDATE billboards SET images = ?, allImages = ? WHERE id = ?",
                (new_i, new_a, rid),
            )
            changed += 1
    con.commit()
    print(f"dev.db: updated {changed} billboard row(s)")

    # ── 3. Verify every referenced path exists on disk ────────────────
    missing = 0
    for rid, images, all_images in cur.execute(
        "SELECT id, images, allImages FROM billboards"
    ).fetchall():
        for blob in (images, all_images):
            if not blob:
                continue
            try:
                paths = json.loads(blob)
            except (TypeError, ValueError):
                continue
            for web in paths or []:
                if isinstance(web, str) and web.startswith("/images/"):
                    if not os.path.exists(os.path.join(ROOT, "public", web.lstrip("/"))):
                        missing += 1
    con.close()
    print(f"verification: {missing} referenced image file(s) missing on disk")
    print("\nOriginal PNGs are still on disk (migration is reversible).")
    print("Once the site looks right, reclaim the space with:")
    print("  python3 scripts/optimize-images.py --delete-originals")


def delete_originals():
    """Remove each .png that has a verified same-size .jpg beside it."""
    pngs = sorted(glob.glob(IMAGE_GLOB, recursive=True))
    freed = removed = 0
    for p in pngs:
        jpg = p[:-4] + ".jpg"
        if not os.path.exists(jpg):
            continue  # no replacement (e.g. a transparent PNG we kept)
        try:
            with Image.open(p) as a, Image.open(jpg) as b:
                if a.size != b.size:
                    continue
        except Exception:  # noqa: BLE001 - unreadable pair, leave both alone
            continue
        freed += os.path.getsize(p)
        os.remove(p)
        removed += 1
    print(f"removed {removed} superseded PNG(s), freed {freed/1048576:.0f} MB")


if __name__ == "__main__":
    main()
