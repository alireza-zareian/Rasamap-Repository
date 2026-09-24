#!/usr/bin/env python3
"""
Turn a geoBoundaries province file into the small vendored outline the map view
draws from.

    python3 scripts/build-iran-map.py <geoBoundaries-IRN-ADM1_simplified.geojson>

Why vendored rather than fetched: the map has to work from an Iranian
connection, from a phone on the demo LAN, and with no API key or billing
account anywhere (Google Maps Platform is not available to Iranian accounts at
all). Anything fetched at runtime is a thing that can be blocked, rate-limited
or billed. So the outline ships inside the bundle and the browser draws it.

Source: geoBoundaries gbOpen, IRN ADM1 — https://www.geoboundaries.org
Licence: CC BY 4.0. The attribution is rendered under the map.

The output keeps [lon, lat] rings rather than pre-projected SVG paths, so the
same data serves the whole-country view and a single zoomed province without a
second file.
"""
import json, math, sys

EN_TO_FA = {
    "Tehran": "تهران", "Alborz": "البرز", "Qazvin": "قزوین", "Qom": "قم",
    "Markazi": "مرکزی", "Isfahan": "اصفهان", "Yazd": "یزد", "Fars": "فارس",
    "Kerman": "کرمان", "Sistan and Baluchestan": "سیستان و بلوچستان",
    "Hormozgan": "هرمزگان", "Bushehr": "بوشهر", "Khuzestan": "خوزستان",
    "Kohgiluyeh and Boyer-Ahmad": "کهگیلویه و بویراحمد",
    "Chaharmahal and Bakhtiari": "چهارمحال و بختیاری", "Lorestan": "لرستان",
    "Ilam": "ایلام", "Kermanshah": "کرمانشاه", "Kurdistan": "کردستان",
    "Hamadan": "همدان", "Zanjan": "زنجان", "East Azerbaijan": "آذربایجان شرقی",
    "West Azerbaijan": "آذربایجان غربی", "Ardabil": "اردبیل", "Gilan": "گیلان",
    "Mazandaran": "مازندران", "Golestan": "گلستان",
    "North Khorasan": "خراسان شمالی", "Razavi Khorasan": "خراسان رضوی",
    "South Khorasan": "خراسان جنوبی", "Semnan": "سمنان",
}

# Degrees. At Iran's latitude ~0.02° is roughly 2 km — invisible on a map drawn
# a thousand pixels wide, and it removes about nine tenths of the points.
EPSILON = 0.02
# Rings smaller than this are islands and coastal specks that render as a single
# pixel; dropping them costs nothing visible and a lot of bytes.
MIN_RING_AREA = 0.01


def perpendicular_distance(p, a, b):
    if a == b:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def simplify(points, eps):
    """Douglas-Peucker, iterative so a 20k-point ring cannot blow the stack."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        worst, idx = 0.0, -1
        for k in range(i + 1, j):
            d = perpendicular_distance(points[k], points[i], points[j])
            if d > worst:
                worst, idx = d, k
        if worst > eps:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(points, keep) if k]


def ring_area(ring):
    """Shoelace, absolute — used only to decide whether a ring is worth keeping."""
    s = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def rings_of(geometry):
    t, c = geometry["type"], geometry["coordinates"]
    if t == "Polygon":
        return [c[0]]                      # outer ring only; no province has a hole
    if t == "MultiPolygon":
        return [poly[0] for poly in c]
    raise SystemExit(f"unexpected geometry {t}")


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    data = json.load(open(sys.argv[1], encoding="utf-8"))

    # A province can arrive as more than one feature (Mazandaran does), so
    # collect rings by Persian name instead of by feature.
    by_name = {}
    unknown = set()
    for f in data["features"]:
        en = f["properties"].get("shapeName", "")
        fa = EN_TO_FA.get(en)
        if not fa:
            unknown.add(en)
            continue
        by_name.setdefault(fa, []).extend(rings_of(f["geometry"]))
    if unknown:
        raise SystemExit(f"unmapped province names: {sorted(unknown)}")
    missing = set(EN_TO_FA.values()) - set(by_name)
    if missing:
        raise SystemExit(f"missing provinces: {sorted(missing)}")

    out, before, after = {}, 0, 0
    for fa, rings in by_name.items():
        kept = []
        for r in rings:
            before += len(r)
            if ring_area(r) < MIN_RING_AREA:
                continue
            s = simplify([(round(x, 3), round(y, 3)) for x, y in r], EPSILON)
            # Round-then-simplify can leave neighbouring duplicates behind.
            d = [s[0]] + [p for i, p in enumerate(s[1:], 1) if p != s[i - 1]]
            if len(d) >= 4:
                kept.append(d)
                after += len(d)
        out[fa] = sorted(kept, key=ring_area, reverse=True)

    lo_x = min(x for rs in out.values() for r in rs for x, _ in r)
    hi_x = max(x for rs in out.values() for r in rs for x, _ in r)
    lo_y = min(y for rs in out.values() for r in rs for _, y in r)
    hi_y = max(y for rs in out.values() for r in rs for _, y in r)

    body = ",\n".join(
        f'  {json.dumps(fa, ensure_ascii=False)}: [' +
        ",".join("[" + ",".join(f"[{x},{y}]" for x, y in ring) + "]" for ring in rings) +
        "]"
        for fa, rings in sorted(out.items())
    )

    ts = f'''// Generated by scripts/build-iran-map.py — do not edit by hand.
//
// Province outlines for the map view, as [lon, lat] rings. Vendored rather than
// fetched: the map must work from an Iranian connection and from the demo LAN,
// with no API key and no billing account anywhere, so nothing about it may
// depend on a request leaving the machine.
//
// Boundaries: geoBoundaries gbOpen IRN ADM1 (https://www.geoboundaries.org),
// CC BY 4.0 — the attribution is rendered under the map.
// Simplified with Douglas-Peucker at {EPSILON}° (~2 km) and rounded to 3 decimals,
// which is far below one pixel at the size this is ever drawn.

export type Ring = [number, number][];

/** Longitude/latitude extent of the whole country, for fitting the viewBox. */
export const IRAN_BOUNDS = {{
  minLng: {lo_x}, maxLng: {hi_x}, minLat: {lo_y}, maxLat: {hi_y},
}} as const;

/** Persian province name → its outline rings, largest first. */
export const PROVINCE_RINGS: Record<string, Ring[]> = {{
{body},
}};
'''
    dest = "lib/geo/iran-provinces.ts"
    open(dest, "w", encoding="utf-8").write(ts)
    print(f"✓ {dest}")
    print(f"  provinces {len(out)} · points {before} → {after} "
          f"({after * 100 // before}%) · {len(ts) // 1024} KB")
    print(f"  bounds lng {lo_x}..{hi_x}  lat {lo_y}..{hi_y}")


if __name__ == "__main__":
    main()
