"use client";
import { useMemo } from "react";
import { X } from "lucide-react";
import type { CatalogueItem } from "@/lib/types";
import PinMap, { type MapPoint } from "@/components/map/PinMap";
import { faNum, faMillions } from "@/lib/format";
import styles from "./explore.module.css";

/**
 * The page of results on the map, beside the grid (§40). Its own chunk, loaded
 * only on a wide screen with the map on (ExploreResults), so a phone never
 * downloads the province outlines for it.
 */
/** A tall drawing for the tall panel beside the grid; .mapPanelBody has the same ratio. */
const MAP_HEIGHT = 760;

export default function ResultsMap({ items, active, onHover, onClose }: {
  items: CatalogueItem[];
  active: string | null;
  onHover: (slug: string | null) => void;
  onClose: () => void;
}) {
  // Kept across renders: the map re-renders on every hover (`active`), and a
  // fresh array here voided all of PinMap's memos, so each card the pointer
  // crossed rebuilt every province outline (§44).
  const points: MapPoint[] = useMemo(() => items.flatMap(b =>
    b.lat != null && b.lng != null ? [{ slug: b.slug, name: b.name, lat: b.lat, lng: b.lng, label: faMillions(b.price) }] : []), [items]);
  const unplaced = items.length - points.length;

  return (
    <aside className={styles.mapPanel} aria-label="نقشهٔ نتایج این صفحه">
      <div className={styles.mapPanelHead}>
        <span>{faNum(points.length)} رسانهٔ این صفحه روی نقشه</span>
        <button type="button" className={styles.mapClose} onClick={onClose} aria-label="بستن نقشه"><X size={16} /></button>
      </div>
      <div className={styles.mapPanelBody}>
        <PinMap points={points} active={active} onHover={onHover} ariaLabel="نقشهٔ نتایج جستجو" height={MAP_HEIGHT} />
      </div>
      {unplaced > 0 && <p className={styles.mapPanelNote}>{faNum(unplaced)} رسانه مختصاتِ قابل‌اتکا ندارد.</p>}
    </aside>
  );
}
