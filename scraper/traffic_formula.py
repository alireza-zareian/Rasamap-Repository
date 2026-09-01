"""
traffic_formula.py — Shared estimation logic for Rasamap scrapers.

All formulas are approximations derived from public data:
  - Iran census city populations (2021)
  - Typical OOH industry exposure ratios (5-8% of local population per billboard)
  - Location-type multipliers calibrated against Tehran known-traffic corridors
  - Price benchmarks from billboardiha scraped data (median by city/type)

Scrapers call estimate_traffic() and estimate_price() and store the results
in the JSON record. The seed script loads those values directly into the DB.
"""

import random

# ── City population (2021 census, thousands) ───────────────────────
_CITY_POP: dict[str, int] = {
    "تهران":       9_000_000,
    "مشهد":        3_400_000,
    "اصفهان":      2_200_000,
    "کرج":         2_000_000,
    "شیراز":       1_900_000,
    "تبریز":       1_800_000,
    "اهواز":       1_200_000,
    "قم":          1_100_000,
    "کرمانشاه":    950_000,
    "ارومیه":      800_000,
    "رشت":         750_000,
    "زاهدان":      700_000,
    "کرمان":       650_000,
    "همدان":       600_000,
    "اردبیل":      550_000,
    "اراک":        550_000,
    "یزد":         500_000,
    "بندرعباس":    500_000,
    "ساری":        450_000,
    "قزوین":       450_000,
    "زنجان":       400_000,
    "سنندج":       380_000,
    "گرگان":       350_000,
    "خرم‌آباد":    300_000,
    "بوشهر":       250_000,
    "بجنورد":      200_000,
    "بیرجند":      200_000,
    "شهرکرد":      180_000,
    "ایلام":       175_000,
    "سمنان":       150_000,
    "یاسوج":       130_000,
    "کیش":         50_000,   # low pop but high commercial density
    "نجف‌آباد":    300_000,
    "کاشان":       330_000,
    "خمینی‌شهر":   200_000,
    "دزفول":       250_000,
    "مبارکه":      100_000,
}

# ── Location keyword → traffic multiplier ─────────────────────────
# Ordered longest-first so a more specific match (e.g. "بزرگراه همت")
# beats a shorter one ("بزرگراه"). We take the max match found.
_LOCATION_MULT: list[tuple[str, float]] = sorted([
    ("همت",       2.4),
    ("رسالت",     2.1),
    ("چمران",     2.2),
    ("صدر",       2.0),
    ("آزادی",     1.8),
    ("انقلاب",    1.7),
    ("ولیعصر",    1.6),
    ("شریعتی",    1.5),
    ("بزرگراه",   1.7),
    ("اتوبان",    1.8),
    ("آزادراه",   1.8),
    ("فرودگاه",   1.5),
    ("هوایی",     1.4),
    ("راه‌آهن",   1.3),
    ("میدان",     1.3),
    ("مرکزی",     1.2),
    ("تقاطع",     1.2),
    ("بلوار",     1.1),
    ("خیابان",    1.0),
], key=lambda x: -len(x[0]))

# ── Type multiplier ────────────────────────────────────────────────
_TYPE_MULT: dict[str, float] = {
    "digital":  1.5,
    "bridge":   1.3,
    "billboard": 1.0,
    "station":  0.7,
    "vehicle":  0.5,
}

# ── Price per m² per month (million tomans) by city ────────────────
_PRICE_PER_SQM: dict[str, float] = {
    "تهران":    6.0,
    "کیش":      5.0,
    "کرج":      3.5,
    "مشهد":     3.6,
    "اصفهان":   3.8,
    "شیراز":    3.0,
    "تبریز":    3.2,
    "اهواز":    2.5,
    "قم":       2.2,
    "کرمانشاه": 2.0,
    "ارومیه":   2.0,
    "رشت":      2.2,
    "اردبیل":   1.8,
    "همدان":    1.8,
    "یزد":      1.8,
    "بندرعباس": 2.0,
    "ساری":     1.7,
    "قزوین":    1.8,
    "زنجان":    1.6,
    "کرمان":    1.7,
    "اراک":     1.6,
}

_TYPE_PRICE_MULT: dict[str, float] = {
    "digital":   1.7,
    "bridge":    1.15,
    "billboard": 1.0,
    "station":   0.75,
    "vehicle":   0.6,
}


def estimate_traffic(
    city: str,
    location: str,
    board_type: str,
    width: float = 6.0,
    height: float = 4.0,
) -> dict:
    """
    Returns a traffic dict for a billboard.

    Formula:
        base    = city_population × 0.05   (5% of city passes a typical board)
        loc_mult = max keyword match in location string
        type_mult = media-type factor
        area_mult = 1 + min(0.25, area/300)  (bigger boards get up to +25%)
        daily   = base × loc_mult × type_mult × area_mult
    """
    pop   = _CITY_POP.get(city, 200_000)
    base  = int(pop * 0.05)

    loc_mult = 1.0
    loc_text = location or ""
    for keyword, mult in _LOCATION_MULT:
        if keyword in loc_text:
            loc_mult = max(loc_mult, mult)
            break  # take first (longest) match only

    type_mult = _TYPE_MULT.get(board_type, 1.0)
    area      = max(4.0, (width or 6.0) * (height or 4.0))
    area_mult = 1.0 + min(0.25, area / 300.0)

    daily = int(base * loc_mult * type_mult * area_mult)
    # Small jitter so not every billboard in the same city is identical
    daily = int(daily * random.uniform(0.92, 1.08))

    viewability = min(95, max(30,
        40
        + int(loc_mult * 8)
        + (8 if board_type == "digital" else 0)
        + min(7, int(area / 20))
    ))

    return {
        "daily":            daily,
        "peakHour":         "08:00-09:00",
        "congestionLevel":  min(10, max(2, daily // 50_000)),
        "pedestrian":       int(daily * 0.06),
        "estimatedViews":   int(daily * 0.35),
        "viewabilityScore": viewability,
    }


def estimate_price(
    city: str,
    board_type: str,
    width: float = 6.0,
    height: float = 4.0,
) -> int:
    """
    Returns estimated monthly price in million tomans.
    Only used when the source site does not publish a price.

    Formula:
        price = area × price_per_sqm(city) × type_multiplier + variance
    """
    area       = max(4.0, (width or 6.0) * (height or 4.0))
    per_sqm    = _PRICE_PER_SQM.get(city, 2.0)
    type_mult  = _TYPE_PRICE_MULT.get(board_type, 1.0)
    base       = area * per_sqm * type_mult
    variance   = random.randint(-10, 15)
    return max(20, int(base) + variance)
