"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin as PinIcon, ArrowRight } from "lucide-react";
import { PROVINCE_RINGS, IRAN_BOUNDS, type Ring } from "@/lib/geo/iran-provinces";
import { fitBounds, project, type Bounds } from "@/lib/geo/distance";
import type { MapPin } from "@/lib/db/billboards";
import { exploreHref, type ExploreFilters } from "@/lib/explore-query";
import { faNum, faMillions } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import styles from "./IranMap.module.css";

/**
 * The catalogue as a map, drawn here rather than embedded from a provider (§32).
 *
 * Two levels: the country shades each province by inventory, from the city
 * column, so every row counts; a chosen province shows its pins, which only
 * rows whose point passes `isPlottable` can have.
 */

/** Internal units. The SVG scales to its container; these only set the aspect. */
const W = 1000;
const H = 760;
/** Below this share of the busiest province, a label would not be worth the ink. */
const LABEL_MIN_SHARE = 0.06;
/** Rough width of one Persian glyph at the label size, for collision testing. */
const LABEL_CHAR_PX = 8.5;
/** Two labels closer than this vertically are treated as the same line. */
const LABEL_LINE_PX = 17;

function ringsBounds(rings: Ring[]): Bounds {
  return fitBounds(rings.flatMap(r => r.map(([lng, lat]) => ({ lng, lat }))));
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
  /** Rows in this scope with no believable point — said on screen, not hidden. */
  unplottable: number;
  /** The filters in play; the map builds its links with `exploreHref`, as a
   *  Server Component cannot pass a function. */
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
  // Frame the pins, not the province: most of a province's media is in one city.
  const bounds = useMemo(() => {
    if (!zoomed) return IRAN_BOUNDS;
    return pins.length ? fitBounds(pins) : ringsBounds(PROVINCE_RINGS[province]);
  }, [zoomed, province, pins]);

  // Re-projected only when the bounds change: once per navigation, not per frame.
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

  // Square root: on a linear ramp Tehran would leave every other province pale.
  const max = Math.max(1, ...Object.values(provinceCounts));
  const shade = (n: number) => (n ? 0.1 + 0.6 * (Math.sqrt(n) / Math.sqrt(max)) : 0);

  // A phone has no hover, so the busiest provinces carry their names.
  const labels = useMemo(() => {
    if (zoomed) return [];
    const wanted = Object.entries(provinceCounts)
      .filter(([name, n]) => n >= max * LABEL_MIN_SHARE && PROVINCE_RINGS[name])
      .sort((a, b) => b[1] - a[1])            // busiest first, so it wins a clash
      .map(([name, n]) => {
        const [lng, lat] = ringCentre(PROVINCE_RINGS[name]);
        return { name, n, ...project(lng, lat, bounds, W, H) };
      });

    // Busiest first; a label that would overlap one already placed is dropped.
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
    <div className={styles.map}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
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
              className={n || isSelf ? styles.clickable : undefined}
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
            className={styles.label}
            // A halo keeps the name readable over pale and dark shading alike.
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
            className={styles.clickable}
            onMouseEnter={() => setHoverPin(pin)}
            onMouseLeave={() => setHoverPin((p) => (p?.slug === pin.slug ? null : p))}
            onClick={() => router.push(`/billboard/${pin.slug}`)}
          >
            <title>{`${pin.name} — ${faMillions(pin.price)} تومان/ماه`}</title>
          </circle>
        ))}
      </svg>

      {/* A pointer convenience; screen readers and touch get the <title>s above. */}
      {(hoverPin || hoverProvince) && (
        <div className={styles.tip}>
          {hoverPin ? (
            <>
              <strong>{hoverPin.name}</strong>
              <div className={styles.tipMeta}>{hoverPin.city} · <b>{faMillions(hoverPin.price)} تومان/ماه</b></div>
            </>
          ) : (
            <><strong>{hoverProvince}</strong><span className={styles.tipMeta}> — {faNum(hoveredCount)} رسانه</span></>
          )}
        </div>
      )}

      {zoomed && (
        <Button size="sm" className={styles.back} onClick={() => router.push(hrefFor(""))}>
          <ArrowRight size={13} /> کل کشور
        </Button>
      )}

      {/* Say how many rows the map cannot place, rather than dropping them silently. */}
      {zoomed && unplottable > 0 && (
        <p className={styles.note}>
          <PinIcon size={13} />
          <span>
            {faNum(unplottable)} رسانه در این محدوده مختصاتِ قابل‌اتکا ندارد و روی نقشه
            نیامده است؛ در فهرست هست و نشانیِ متنی‌اش درست است.
          </span>
        </p>
      )}
    </div>
  );
}
