"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { PROVINCE_RINGS, IRAN_BOUNDS } from "@/lib/geo/iran-provinces";
import { fitBounds, project, type Bounds } from "@/lib/geo/distance";
import styles from "./PinMap.module.css";

/**
 * A handful of media on the map of Iran, each as a labelled pin — the results
 * beside the catalogue, the boards of a campaign (§40). Province outlines for
 * context, framed on the pins; no tiles and no provider (§32).
 *
 * `active` and `onHover` tie a pin to its card: hovering either lights both.
 */

export interface MapPoint {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  /** What the bubble says: a price, a number in a plan. */
  label: string;
}

const W = 600;
/** Rough width of one glyph of the bubble text, to size the bubble around it. */
const CHAR_PX = 9;

function toPath(rings: [number, number][][], b: Bounds, H: number): string {
  return rings.map(r => `M${r.map(([lng, lat]) => {
    const { x, y } = project(lng, lat, b, W, H);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join("L")}Z`).join(" ");
}

export default function PinMap({ points, active, onHover, ariaLabel, height: H = 520 }: {
  points: MapPoint[];
  active?: string | null;
  onHover?: (slug: string | null) => void;
  ariaLabel: string;
  /** The drawing's height for a width of 600: match the box it fills, so the pins use all of it. */
  height?: number;
}) {
  const router = useRouter();
  const bounds = useMemo(() => (points.length ? fitBounds(points, 0.18, 0.08) : IRAN_BOUNDS), [points]);

  // Only provinces that reach into the frame are drawn; at city zoom that is one or two.
  const provinces = useMemo(() => Object.entries(PROVINCE_RINGS).flatMap(([name, rings]) => {
    const inFrame = rings.some(r => r.some(([lng, lat]) =>
      lng >= bounds.minLng - 1 && lng <= bounds.maxLng + 1 && lat >= bounds.minLat - 1 && lat <= bounds.maxLat + 1));
    return inFrame ? [{ name, d: toPath(rings, bounds, H) }] : [];
  }), [bounds, H]);

  // A city page puts twenty pins in a few square kilometres. Each gets a bubble
  // only where it has room — in the order given, so the first results win — and
  // the rest are dots whose bubble appears on hover.
  const placed = useMemo(() => {
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
    return points.map(p => {
      const { x, y } = project(p.lng, p.lat, bounds, W, H);
      const w = Math.max(30, p.label.length * CHAR_PX + 16);
      const box = { x0: x - w / 2 - 2, x1: x + w / 2 + 2, y0: y - 40, y1: y - 8 };
      const free = !boxes.some(b => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1);
      if (free) boxes.push(box);
      return { ...p, x, y, w, bubble: free };
    });
  }, [points, bounds, H]);
  // Dots under bubbles, and the active pin over everything.
  const ordered = [
    ...placed.filter(p => !p.bubble && p.slug !== active),
    ...placed.filter(p => p.bubble && p.slug !== active),
    ...placed.filter(p => p.slug === active),
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={ariaLabel}>
      {provinces.map(p => (
        <path key={p.name} d={p.d} className={styles.province}><title>{p.name}</title></path>
      ))}
      {ordered.map(p => {
        const on = p.slug === active;
        return (
          <g
            key={p.slug}
            className={`${styles.pin} ${on ? styles.on : ""}`}
            transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
            onMouseEnter={() => onHover?.(p.slug)}
            onMouseLeave={() => onHover?.(null)}
            onClick={() => router.push(`/billboard/${p.slug}`)}
          >
            <title>{`${p.name} — ${p.label}`}</title>
            {p.bubble || on ? (
              <>
                <path d="M0 0 L-6 -10 L6 -10 Z" className={styles.tail} />
                <rect x={-p.w / 2} y={-38} width={p.w} height={29} rx={14.5} className={styles.bubble} />
                <text y={-19} textAnchor="middle" className={styles.text}>{p.label}</text>
              </>
            ) : (
              <circle r={6.5} className={styles.dot} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
