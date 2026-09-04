#!/usr/bin/env python3
"""
Recompute traffic estimates, and repair prices that were misread at scrape time.

Run from the project root:

    python3 scripts/recompute-estimates.py --dry-run    # report only
    python3 scripts/recompute-estimates.py              # write

WHAT IT TOUCHES

  traffic / estimatedViews   Recomputed for every record from
                             scraper/traffic_formula.py. These have always been
                             estimates; the model behind them changed, so they
                             all move.

  width / height / area      Repaired where a source published centimetres and
                             they were stored as metres — eleven faces read
                             2040 x 310, two kilometres wide. Everything derives
                             from size, so this has to be right first: it was a
                             broken size, not a broken price, that made a
                             correct 170M look impossible next to a model
                             expecting millions.

  price                      Left alone. A price published by a source is the
                             honest figure and the model does not get to
                             overrule it — except where the source page was
                             misread and the number is impossible (841,503
                             million tomans a month for a screen in Shahroud).
                             Those, and only those, fall back to the estimate.

Both the database and the scraped JSON that seeds it are updated, so a re-seed
does not quietly restore the old numbers — the same trap the image migration
found when it rewrote paths in one place but not the other.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))

from traffic_formula import (  # noqa: E402
    estimate_price,
    estimate_traffic,
    is_plausible_price,
    normalise_size,
)

DB = ROOT / "dev.db"
SEED_JSON = ROOT / "scraper" / "data" / "billboards.json"
BACKUP_DIR = ROOT / "backups"


def backup() -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = BACKUP_DIR / f"pre-estimate-recompute-{stamp}"
    target.mkdir(parents=True, exist_ok=True)
    shutil.copy2(DB, target / DB.name)
    if SEED_JSON.exists():
        shutil.copy2(SEED_JSON, target / SEED_JSON.name)
    return target


def derived_prices(monthly: int) -> dict[str, int]:
    """The other three columns are a fixed discount ladder off the monthly rate."""
    return {
        "priceWeekly":    round(monthly / 4),
        "priceQuarterly": round(monthly * 3 * 0.9),
        "priceYearly":    round(monthly * 12 * 0.8),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report what would change, write nothing")
    args = ap.parse_args()

    if not DB.exists():
        print(f"no database at {DB}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "select id, name, city, location, type, width, height, price, source, traffic from billboards"
    ).fetchall()

    updates: list[tuple] = []
    repaired: list[tuple[str, str, int, int]] = []
    views_before, views_after = [], []

    resized: list[tuple[str, int, int, int, int]] = []

    for r in rows:
        width, height = normalise_size(r["width"], r["height"])
        width, height = round(width), round(height)
        size = {}
        if (width, height) != (r["width"], r["height"]):
            resized.append((r["name"], r["width"], r["height"], width, height))
            size = {"width": width, "height": height, "area": width * height}

        traffic = estimate_traffic(
            r["city"], r["location"], r["type"], width, height, r["name"]
        )
        views_before.append(json.loads(r["traffic"]).get("estimatedViews", 0))
        views_after.append(traffic["estimatedViews"])

        price = r["price"]
        prices = {}
        if not is_plausible_price(price, r["city"], r["type"], width, height, r["location"]):
            fixed = estimate_price(r["city"], r["type"], width, height, r["location"], r["name"])
            repaired.append((r["name"], r["city"], price, fixed))
            prices = {"price": fixed, **derived_prices(fixed)}

        updates.append((
            r["id"], json.dumps(traffic, ensure_ascii=False), traffic["estimatedViews"], {**size, **prices},
        ))

    views_before.sort()
    views_after.sort()
    mid = len(rows) // 2
    print(f"records                 {len(rows):,}")
    print(f"median daily exposure   {views_before[mid]:,} -> {views_after[mid]:,}")
    print(f"highest daily exposure  {views_before[-1]:,} -> {views_after[-1]:,}")
    print(f"sizes repaired          {len(resized)}")
    for name, ow, oh, nw, nh in resized[:5]:
        print(f"    {ow:>5} x {oh:<4} -> {nw:>3} x {nh:<3}   {name[:44]}")
    print(f"prices repaired         {len(repaired)} ({100 * len(repaired) / len(rows):.1f}%)")
    for name, city, was, now in sorted(repaired, key=lambda x: -x[2])[:8]:
        print(f"    {was:>10,}M -> {now:>6,}M   {city}  {name[:44]}")

    if args.dry_run:
        print("\ndry run — nothing written")
        return 0

    where = backup()
    print(f"\nbackup: {where.relative_to(ROOT)}")

    with conn:
        for bid, traffic_json, views, prices in updates:
            columns = ["traffic = ?", "estimatedViews = ?"]
            values: list = [traffic_json, views]
            for column, value in prices.items():
                columns.append(f"{column} = ?")
                values.append(value)
            values.append(bid)
            conn.execute(f"update billboards set {', '.join(columns)} where id = ?", values)
    print(f"database: {len(updates):,} rows updated")

    # The seed JSON keyed by the same identity, so a re-seed keeps these numbers.
    if SEED_JSON.exists():
        seed = json.loads(SEED_JSON.read_text(encoding="utf-8"))
        by_key = {(r["name"], r["city"]): r for r in rows}
        touched = 0
        for entry in seed:
            source = by_key.get((entry.get("name"), entry.get("city")))
            if source is None:
                continue
            w, h = normalise_size(source["width"], source["height"])
            w, h = round(w), round(h)
            entry["width"], entry["height"] = w, h
            traffic = estimate_traffic(
                source["city"], source["location"], source["type"], w, h, source["name"],
            )
            entry["traffic"] = traffic
            if not is_plausible_price(entry.get("price"), source["city"], source["type"],
                                      w, h, source["location"]):
                fixed = estimate_price(source["city"], source["type"], w, h,
                                       source["location"], source["name"])
                entry["price"] = fixed
                entry.update(derived_prices(fixed))
            touched += 1
        SEED_JSON.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"seed json: {touched:,} of {len(seed):,} entries updated")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
