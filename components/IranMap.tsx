"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin as PinIcon, ArrowRight } from "lucide-react";
import { PROVINCE_RINGS, IRAN_BOUNDS, type Ring } from "@/lib/geo/iran-provinces";
import { project, type Bounds } from "@/lib/geo/distance";
import type { MapPin } from "@/lib/db/billboards";
import { exploreHref, type ExploreFilters } from "@/lib/explore-query";
import { faNum } from "@/lib/format";

/**
 * The catalogue as a map, drawn from coordinates rather than embedded.
 *
 * Every provider that would draw this for us is either billed, keyed, or
 * unreachable from an Iranian connection — usually all three (§32). So the
 * outline ships in the bundle, the arithmetic runs here, and the map has no way
 * to fail that the rest of the page would not fail with it.
 *
 * Two levels, because they answer different questions. The country view shades
 * each province by how much inventory is in it — "where is there anything?" —
 * and is built from the city column, so it is exact for all 3,528 rows. Picking
 * a province drops to its own pins, which is "where exactly?", and that one can
 * only show rows whose coordinates survive `isPlottable`.
 */

/** Internal units. The SVG scales to its container; these only set the aspect. */
const W = 1000;
const H = 760;
/** Breathing room around whatever is being zoomed to, as a share of its extent. */
const ZOOM_PAD = 0.12;
/**
 * Floor on how tight a zoom may get, in degrees (~17 km).
 *
 * A city whose pins all sit on one boulevard would otherwise fill the frame at
 * street scale, on a drawing that has no streets — magnification with nothing
 * to magnify.
 */
const MIN_SPAN_DEG = 0.15;
/** Below this share of the busiest province, a label would not be worth the ink. */
const LABEL_MIN_SHARE = 0.06;
/** Rough width of one Persian glyph at the label size, for collision testing. */
const LABEL_CHAR_PX = 8.5;
/** Two labels closer than this vertically are treated as the same line. */
const LABEL_LINE_PX = 17;

/** Pad, and widen anything narrower than the floor, around its own middle. */
function fit(
  minLng: number, maxLng: number, minLat: number, maxLat: number,
): Bounds {
  const padX = Math.max((maxLng - minLng) * ZOOM_PAD, MIN_SPAN_DEG / 2);
  const padY = Math.max((maxLat - minLat) * ZOOM_PAD, MIN_SPAN_DEG / 2);
  return {
    minLng: minLng - padX, maxLng: maxLng + padX,
    minLat: minLat - padY, maxLat: maxLat + padY,
  };
}

function ringsBounds(rings: Ring[]): Bounds {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const r of rings) for (const [lng, lat] of r) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return fit(minLng, maxLng, minLat, maxLat);
}

function pinsBounds(pins: MapPin[]): Bounds {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const p of pins) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return fit(minLng, maxLng, minLat, maxLat);
}

/** Rough centre of a shape, for dropping a label on it. */
function ringCentre(rings: Ring[]): [number, number] {
  const b = ringsBounds(rings);
  return [(b.minLng + b.maxLng) / 2, (b.minLat + b.maxLat) / 2];
}

function toPath(rings: Ring[], b: Bounds): string {
  return rings.map((r) => {
    const pts = r.map(([lng, lat]) => {
      const { x, y } = project(lng, lat, b, W, H);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M${pts.join("L")}Z`;
  }).join(" ");
}

interface Props {
  /** Published rows per province — the shading, and exact for every row. */
  provinceCounts: Record<string, number>;
  /** Pins for the province in view. Empty at country level, by design. */
  pins: MapPin[];
  /** How many rows in this scope could not be placed, and why it is honest. */
  unplottable: number;
  /** The filters in play. A Server Component cannot hand a client one a
   *  function, so the map gets the state and builds its own addresses — which
   *  also keeps every link on this page going through `exploreHref`. */
  filters: ExploreFilters;
}

export default function IranMap({
  provinceCounts, pins, unplottable, filters,
}: Props) {
  const router = useRouter();
  const province = filters.province;
  const hrefFor = (p: string) =>
    exploreHref({ ...filters, province: p, city: "", page: 1 }, "/explore/map");
  const [hoverProvince, setHoverProvince] = useState<string | null>(null);
  const [hoverPin, setHoverPin] = useState<MapPin | null>(null);

  const zoomed = Boolean(province && PROVINCE_RINGS[province]);
  // Frame the pins rather than the province when there are any: nearly all of a
  // province's media sits inside one city, so fitting the province spends most
  // of the picture on empty country either side of the part being looked at.
  const bounds = useMemo(() => {
    if (!zoomed) return IRAN_BOUNDS;
    return pins.length ? pinsBounds(pins) : ringsBounds(PROVINCE_RINGS[province]);
  }, [zoomed, province, pins]);

  // Every province is redrawn when the bounds change and never otherwise —
  // 2,658 points through one projection, which is far cheaper than it looks and
  // happens once per navigation rather than once per frame.
  const paths = useMemo(
    () => Object.entries(PROVINCE_RINGS).map(
      ([name, rings]) => [name, toPath(rings, bounds)] as const,
    ),
    [bounds],
  );

  const placed = useMemo(
    () => pins.map((p) => ({ pin: p, ...project(p.lng, p.lat, bounds, W, H) })),
    [pins, bounds],
  );

  // Square root, not linear: Tehran holds several times what the next province
  // does, and on a linear ramp every other province reads as empty.
  const max = Math.max(1, ...Object.values(provinceCounts));
  const shade = (n: number) => (n ? 0.1 + 0.6 * (Math.sqrt(n) / Math.sqrt(max)) : 0);

  // Hover names a province, but a phone has no hover — so the provinces worth
  // naming carry their name. Only the busiest few: thirty-one labels at this
  // size would overlap into noise.
  const labels = useMemo(() => {
    if (zoomed) return [];
    const wanted = Object.entries(provinceCounts)
      .filter(([name, n]) => n >= max * LABEL_MIN_SHARE && PROVINCE_RINGS[name])
      .sort((a, b) => b[1] - a[1])            // busiest first, so it wins a clash
      .map(([name, n]) => {
        const [lng, lat] = ringCentre(PROVINCE_RINGS[name]);
        return { name, n, ...project(lng, lat, bounds, W, H) };
      });

    // Two provinces whose centres sit close together — the two Azerbaijans —
    // would print their names on top of each other. Place them in order of how
    // much media each holds and drop any that will not fit, which is the one
    // rule that never leaves an unreadable pair on screen.
    const kept: typeof wanted = [];
    for (const l of wanted) {
      const halfW = (l.name.length * LABEL_CHAR_PX) / 2;
      const clash = kept.some((k) =>
        Math.abs(k.x - l.x) < halfW + (k.name.length * LABEL_CHAR_PX) / 2 &&
        Math.abs(k.y - l.y) < LABEL_LINE_PX);
      if (!clash) kept.push(l);
    }
    return kept;
  }, [zoomed, provinceCounts, max, bounds]);

  const hoveredCount = hoverProvince ? provinceCounts[hoverProvince] ?? 0 : 0;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", touchAction: "manipulation" }}
        role="img"
        aria-label={zoomed ? `نقشهٔ استان ${province}` : "نقشهٔ پراکندگی رسانه‌ها در ایران"}
      >
        {paths.map(([name, d]) => {
          const n = provinceCounts[name] ?? 0;
          const isSelf = name === province;
          const active = hoverProvince === name;
          return (
            <path
              key={name}
              d={d}
              onMouseEnter={() => setHoverProvince(name)}
              onMouseLeave={() => setHoverProvince((p) => (p === name ? null : p))}
              onClick={() => router.push(hrefFor(isSelf ? "" : name))}
              style={{ cursor: n || isSelf ? "pointer" : "default" }}
              fill="var(--accent)"
              fillOpacity={
                zoomed
                  // In focus, the neighbours are context and nothing more.
                  ? (isSelf ? 0.2 : 0.05)
                  : (active ? shade(n) + 0.16 : shade(n))
              }
              stroke={isSelf || active ? "var(--accent)" : "var(--border)"}
              strokeWidth={isSelf ? 2 : 1}
              strokeLinejoin="round"
            >
              <title>{`${name} — ${faNum(n)} رسانه`}</title>
            </path>
          );
        })}

        {labels.map((l) => (
          <text
            key={l.name}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            dominantBaseline="middle"
            pointerEvents="none"
            style={{ fontSize: 15, fontWeight: 700, fill: "var(--text-main)" }}
            // A halo, so a name stays readable over both the palest province
            // and the darkest one without needing two colours.
            stroke="var(--bg-card)"
            strokeWidth={3.5}
            paintOrder="stroke"
          >
            {l.name}
          </text>
        ))}

        {placed.map(({ pin, x, y }) => (
          <circle
            key={pin.slug}
            cx={x}
            cy={y}
            r={hoverPin?.slug === pin.slug ? 7 : 4.5}
            fill="var(--accent-warm)"
            stroke="#fff"
            strokeWidth={1.4}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoverPin(pin)}
            onMouseLeave={() => setHoverPin((p) => (p?.slug === pin.slug ? null : p))}
            onClick={() => router.push(`/billboard/${pin.slug}`)}
          >
            <title>{`${pin.name} — ${faNum(pin.price)}M تومان/ماه`}</title>
          </circle>
        ))}
      </svg>

      {/* One floating label for whichever thing the pointer is on. It is a
          convenience on top of the <title> elements above, which are what a
          screen reader and a touch device actually get. */}
      {(hoverPin || hoverProvince) && (
        <div style={{
          position: "absolute", top: 10, insetInlineStart: 10, pointerEvents: "none",
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: 9, padding: "7px 12px", fontSize: "0.78rem",
          boxShadow: "0 6px 20px rgba(0,0,0,0.28)", maxWidth: "60%",
        }}>
          {hoverPin ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{hoverPin.name}</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                {hoverPin.city} · <span style={{ color: "var(--accent-warm)", fontWeight: 700 }}>
                  {faNum(hoverPin.price)}M تومان/ماه
                </span>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 700 }}>{hoverProvince}</span>
              <span style={{ color: "var(--text-muted)" }}> — {faNum(hoveredCount)} رسانه</span>
            </>
          )}
        </div>
      )}

      {zoomed && (
        <button
          onClick={() => router.push(hrefFor(""))}
          style={{
            position: "absolute", top: 10, insetInlineEnd: 10,
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--bg-card)", border: "1px solid var(--border)",
            color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.78rem",
            borderRadius: 9, padding: "7px 12px", cursor: "pointer",
          }}
        >
          <ArrowRight size={13} /> کل کشور
        </button>
      )}

      {/* Saying the number out loud is the point. A map that quietly drops one
          row in six is a map that lies; one that says so is a map with a known
          edge (§5). */}
      {zoomed && unplottable > 0 && (
        <div style={{
          marginTop: 10, fontSize: "0.72rem", color: "var(--text-muted)",
          display: "flex", alignItems: "flex-start", gap: 6, lineHeight: 1.8,
        }}>
          <PinIcon size={13} style={{ flexShrink: 0, marginTop: 3 }} />
          <span>
            {faNum(unplottable)} رسانه در این محدوده مختصاتِ قابل‌اتکا ندارد و روی نقشه
            نیامده است؛ در فهرست هست و نشانیِ متنی‌اش درست است.
          </span>
        </div>
      )}
    </div>
  );
}
