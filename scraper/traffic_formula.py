"""
traffic_formula.py — Shared estimation logic for Rasamap scrapers.

Most sources publish a photo, a size and a street name, and nothing else. These
functions turn that into the two numbers the catalogue sorts and filters on:
daily exposure and a monthly price. They are estimates, and the site says so;
what they must not be is arbitrary.

METHOD
------
The model follows the shape the out-of-home industry uses (Geopath in the US,
Route in the UK): count the traffic that passes, convert it to people, then
discount it by how much of that audience could actually see this particular
face.

    vehicles   = road class base x city size factor
    persons    = vehicles x occupancy
    pedestrians= f(road class, media type)
    opportunity= persons + pedestrians          "could pass it"
    visibility = f(size, media type, road class) as a percentage
    impressions= opportunity x visibility       "could see it"

Two things follow from that shape and are worth stating, because the previous
version got both wrong:

  * The **road** decides the traffic, not the city. A city's population is a
    weak proxy: the old model started every Tehran face at 5% of nine million
    people, so a board on a back street claimed 450,000 viewers a day. A
    freeway carries freeway traffic in any city; the city only scales it, and
    sub-linearly.
  * Visibility has to **reduce** the number. The old model computed a
    viewability score, displayed it, and then ignored it — impressions were a
    flat 35% of traffic whether the face was a lit digital screen over a
    motorway or a small panel in a station.

DETERMINISM
-----------
No randomness. The old model multiplied by `random.uniform(0.92, 1.08)`, so the
same billboard scraped twice produced two different numbers and no figure in the
report could be reproduced. Where variety is wanted — so that two faces on the
same street are not identical — it comes from a hash of the record's own
identity, which is stable across runs.

SOURCES
-------
City populations: 2016 national census, projected. Occupancy 1.55 persons per
vehicle: Tehran Traffic Control Company published figures for urban trips. Road
class volumes: order-of-magnitude figures for Iranian urban arterials and
freeways. Price anchors: median of prices actually published by billboardiha and
aradholding, per city, which is why the levels match the market even though the
model is not the market's.
"""

from hashlib import blake2b

# ── City population ────────────────────────────────────────────────
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
    "کاشان":       330_000,
    "خرم‌آباد":    300_000,
    "نجف‌آباد":    300_000,
    "دزفول":       250_000,
    "بوشهر":       250_000,
    "بجنورد":      200_000,
    "بیرجند":      200_000,
    "خمینی‌شهر":   200_000,
    "شهرکرد":      180_000,
    "ایلام":       175_000,
    "سمنان":       150_000,
    "یاسوج":       130_000,
    "مبارکه":      100_000,
    "کیش":         50_000,   # small resident population, resort traffic
}
_DEFAULT_POP = 200_000

# ── Road classes ───────────────────────────────────────────────────
# `vehicles` is a two-way daily count for that class of road in a city of one
# million; `walk` is pedestrians as a share of vehicle traffic, which is what
# separates a motorway shoulder from a shopping street; `see` is the share of
# passers-by with a real chance of reading the face, before size and media type
# adjust it — traffic that is moving at 100 km/h has less of one than traffic
# stopped at a junction.
_ROAD_CLASSES: dict[str, dict] = {
    "freeway":  {"vehicles": 120_000, "walk": 0.01, "see": 0.34, "peak": "17:00-19:00", "congestion": 8},
    "arterial": {"vehicles":  52_000, "walk": 0.09, "see": 0.42, "peak": "07:30-09:00", "congestion": 7},
    "junction": {"vehicles":  38_000, "walk": 0.22, "see": 0.55, "peak": "17:30-19:30", "congestion": 9},
    "street":   {"vehicles":  17_000, "walk": 0.18, "see": 0.46, "peak": "18:00-20:00", "congestion": 5},
    "transit":  {"vehicles":   6_000, "walk": 2.40, "see": 0.61, "peak": "07:00-08:30", "congestion": 4},
    "local":    {"vehicles":   7_000, "walk": 0.14, "see": 0.40, "peak": "18:00-20:00", "congestion": 3},
}

# Keywords that place a location in a class. Checked longest-first so that a
# specific corridor beats the generic word inside it ("بزرگراه همت" before
# "بزرگراه"). Everything unrecognised falls to "street", which is the honest
# default: most addresses in the data are an ordinary named road.
_LOCATION_CLASS: list[tuple[str, str]] = sorted(
    [(k, "freeway") for k in ("آزادراه", "اتوبان", "بزرگراه", "کمربندی", "محور", "همت", "چمران", "صدر", "حکیم", "نیایش", "رسالت", "یادگار", "شهید کاظمی")]
    + [(k, "arterial") for k in ("بلوار", "خیابان اصلی", "ولیعصر", "آزادی", "انقلاب", "شریعتی", "امام رضا", "چهارباغ", "پاسداران", "ستارخان", "جمهوری")]
    + [(k, "junction") for k in ("میدان", "تقاطع", "فلکه", "چهارراه", "سه راه", "دوربرگردان", "پل ", "عوارضی")]
    + [(k, "transit") for k in ("ایستگاه", "مترو", "ترمینال", "فرودگاه", "راه‌آهن", "راه آهن", "پایانه")]
    + [(k, "local") for k in ("کوچه", "شهرک", "محله", "پارک")],
    key=lambda kv: -len(kv[0]),
)

# ── Media type ─────────────────────────────────────────────────────
# `see` multiplies visibility: a lit digital face repeating its message is read
# by more of the people who pass it than a static sheet. `price` is the market's
# premium for the format, independent of audience.
_TYPE: dict[str, dict] = {
    "digital":   {"see": 1.30, "price": 1.70},
    "bridge":    {"see": 1.15, "price": 1.15},
    "billboard": {"see": 1.00, "price": 1.00},
    "station":   {"see": 0.85, "price": 0.75},
    "vehicle":   {"see": 0.70, "price": 0.60},
}
_TYPE_DEFAULT = {"see": 1.0, "price": 1.0}

# Price per square metre per month, million tomans, for an ordinary street in
# that city. Not guessed: each value is the city's own published prices divided
# by what the rest of this model predicts for those same faces, taken as a
# median over every scraped record in that city — 39 cities and 2,500 prices.
# So the model carries the shape (size, format, road class) and the market
# supplies the level.
#
# Tehran reads lower here than a hand-written guess would put it (2.78, not 6.0)
# because the premium that used to be buried in this number now sits where it
# belongs: on the road class, where a freeway face earns 1.55x an ordinary one.
_PRICE_PER_SQM: dict[str, float] = {
    "تبریز": 2.91, "کرج": 2.9, "اهواز": 2.84, "تهران": 2.78,
    "آمل": 2.39, "بابل": 2.36, "چالوس": 2.23, "اصفهان": 2.2,
    "ماهشهر": 2.19, "رشت": 2.11, "کیش": 1.85, "ساری": 1.76,
    "سقز": 1.76, "همدان": 1.6, "اردبیل": 1.57, "یزد": 1.49,
    "شیراز": 1.39, "کرمان": 1.34, "مشهد": 1.22, "خوی": 1.09,
    "ایلام": 1.07, "کاشمر": 1.06, "ارومیه": 1.01, "خرم آباد": 1.0,
    "بجنورد": 0.94, "شهرکرد": 0.88, "قزوین": 0.88, "قم": 0.79,
    "بوشهر": 0.79, "زاهدان": 0.72, "گرگان": 0.7, "کاشان": 0.63,
    "دیواندره": 0.63, "بهشهر": 0.56, "بندرعباس": 0.55, "سمنان": 0.54,
    "زنجان": 0.53, "سنندج": 0.53, "لردگان": 0.4,
}
# Median across all cities, for the ones with too few prices to calibrate.
_DEFAULT_PER_SQM = 1.22

# What the location is worth to an advertiser, relative to that city median.
_CLASS_PRICE_MULT: dict[str, float] = {
    "freeway": 1.55, "junction": 1.25, "arterial": 1.15,
    "street": 1.00, "transit": 0.85, "local": 0.75,
}

_OCCUPANCY = 1.55          # persons per vehicle, urban Iranian average
_REFERENCE_POP = 1_000_000  # the population the road-class volumes describe

# Above this, a "metre" is not a metre. Eleven records arrived from irbillboard
# reading 2040 x 310 — a face two kilometres wide — because that source
# publishes some sizes in centimetres. Left alone they poisoned everything
# downstream: an area of 632,400 m², a model price in the millions, and, worst,
# a *correct* published price of 170M judged implausible against it. The largest
# real face in the rest of the catalogue is 41 m, so 60 is a safe line.
_MAX_REASONABLE_M = 60.0


def normalise_size(width: float | None, height: float | None) -> tuple[float, float]:
    """Metres, whatever unit the source happened to publish."""
    w = float(width or 6.0)
    h = float(height or 4.0)
    if w > _MAX_REASONABLE_M or h > _MAX_REASONABLE_M:
        w, h = w / 100.0, h / 100.0
    return max(0.5, w), max(0.5, h)


def classify_location(location: str, board_type: str = "") -> str:
    """Which kind of road this face stands on. See `_LOCATION_CLASS`."""
    if board_type == "station":
        return "transit"
    text = location or ""
    for keyword, road_class in _LOCATION_CLASS:
        if keyword in text:
            return road_class
    return "street"


def _city_factor(city: str) -> float:
    """
    How much busier this city's roads are than a city of one million.

    Deliberately sub-linear (a 0.35 exponent): Tehran has twenty-three times the
    people of Zanjan but its arterials do not carry twenty-three times the cars,
    they carry about three times. Raising population to a fractional power is the
    standard way to express that, and it keeps the spread across the catalogue to
    roughly 4x instead of 70x.
    """
    pop = _CITY_POP.get(city, _DEFAULT_POP)
    return (pop / _REFERENCE_POP) ** 0.35


def _spread(seed: str, span: float = 0.12) -> float:
    """
    A stable multiplier in [1-span, 1+span], derived from the record's identity.

    Two faces on the same street should not report identical figures, but the
    same face must report the same figure every time it is scraped — otherwise
    no number in the thesis can be checked twice. Hashing the identity gives
    variety without randomness.
    """
    digest = blake2b(seed.encode("utf-8"), digest_size=4).digest()
    unit = int.from_bytes(digest, "big") / 0xFFFFFFFF     # 0.0 – 1.0
    return 1.0 - span + (2 * span * unit)


def estimate_traffic(
    city: str,
    location: str,
    board_type: str,
    width: float = 6.0,
    height: float = 4.0,
    name: str = "",
) -> dict:
    """Daily audience for one face. See the module docstring for the method."""
    width, height = normalise_size(width, height)
    road_class = classify_location(location, board_type)
    road = _ROAD_CLASSES[road_class]
    kind = _TYPE.get(board_type, _TYPE_DEFAULT)

    variation = _spread(f"{city}|{location}|{name}|{width}x{height}")

    vehicles = int(road["vehicles"] * _city_factor(city) * variation)
    pedestrians = int(vehicles * road["walk"])
    opportunity = int(vehicles * _OCCUPANCY) + pedestrians

    # Visibility: the share of that audience with a real chance of reading it.
    # Size helps, but with diminishing returns — doubling a face does not double
    # its readers, so area enters as a square root and is capped at +30%.
    area = max(4.0, width * height)
    size_bonus = min(0.30, ((area / 48.0) ** 0.5 - 1.0) * 0.30)
    visibility = road["see"] * kind["see"] * (1.0 + size_bonus)
    visibility = max(0.18, min(0.82, visibility))

    return {
        "daily":            vehicles,
        "peakHour":         road["peak"],
        "congestionLevel":  road["congestion"],
        "pedestrian":       pedestrians,
        "estimatedViews":   int(opportunity * visibility),
        "viewabilityScore": round(visibility * 100),
    }


def estimate_price(
    city: str,
    board_type: str,
    width: float = 6.0,
    height: float = 4.0,
    location: str = "",
    name: str = "",
) -> int:
    """
    Monthly price in million tomans, for faces whose source publishes none.

    Area and city set the level; the road class moves it. That last term is the
    one the previous version was missing, and it is the one an advertiser cares
    about most — two identical sheets in the same city, one over a freeway and
    one on a side street, are not the same product and were priced as if they
    were.
    """
    width, height = normalise_size(width, height)
    area = max(4.0, width * height)
    road_class = classify_location(location, board_type)

    price = (
        area
        * _PRICE_PER_SQM.get(city, _DEFAULT_PER_SQM)
        * _TYPE.get(board_type, _TYPE_DEFAULT)["price"]
        * _CLASS_PRICE_MULT[road_class]
        * _spread(f"price|{city}|{location}|{name}", span=0.08)
    )
    return max(5, round(price))


def is_plausible_price(
    price: int | None,
    city: str,
    board_type: str,
    width: float = 6.0,
    height: float = 4.0,
    location: str = "",
) -> bool:
    """
    Whether a price read off a source page can be believed.

    Scraped prices are the honest data and are kept as they are — but a parse
    that goes wrong goes wrong by orders of magnitude, not by a few percent. One
    record in this dataset arrived at 841,503 million tomans a month, which is
    841 billion, for a screen in Shahroud. Anything more than eight times or
    less than an eighth of what the model expects is a broken read, not a
    surprising price.
    """
    if price is None or price <= 0:
        return False
    expected = estimate_price(city, board_type, width, height, location)
    return expected / 8 <= price <= expected * 8
