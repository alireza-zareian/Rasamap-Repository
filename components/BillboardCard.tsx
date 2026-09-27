"use client";
import Link from "next/link";
import { Scale, Star, Sparkles } from "lucide-react";
import MediaImage from "@/components/MediaImage";
import { type CatalogueItem, typeLabels, availabilityLabels } from "@/lib/types";
import { faNum, faCompact } from "@/lib/format";
import { availabilityTone } from "@/components/ui/availability";
import { cssVar } from "@/components/ui/css-var";
import styles from "./BillboardCard.module.css";

interface BillboardCardProps {
  billboard: CatalogueItem;
  isCompared: boolean;
  onCompare: () => void;
  listMode?: boolean;
}

export default function BillboardCard({ billboard: b, isCompared, onCompare, listMode = false }: BillboardCardProps) {
  const tone = cssVar("--tone", availabilityTone(b.availability));
  const status = `● ${availabilityLabels[b.availability] ?? b.availability}`;
  const views = b.traffic?.estimatedViews ?? 0;

  const figures = (
    <div className={styles.figures}>
      {views > 0 && <span className={styles.views}>~{faCompact(views)} نفر/روز ·</span>}
      <span className={styles.price}>{faNum(b.price)}M</span>
      <span className={styles.unit}>ت/ماه</span>
    </div>
  );
  const actions = (
    <div className={styles.actions}>
      <button type="button" className={styles.action} onClick={e => { e.stopPropagation(); onCompare(); }}
        aria-label={isCompared ? "حذف از مقایسه" : "افزودن به مقایسه"} aria-pressed={isCompared}>
        <Scale size={12} /> مقایسه
      </button>
      <Link href={`/billboard/${b.slug}`} className={`${styles.action} ${listMode ? "" : styles.primary}`}>مشخصات</Link>
    </div>
  );

  if (listMode) {
    return (
      <div data-testid="billboard-card" className={`${styles.row} ${isCompared ? styles.compared : ""}`} style={tone}>
        <div className={styles.thumb}>
          {/* 88 CSS pixels, so the loader hands over the 256-wide variant. */}
          <MediaImage src={b.images?.[0]} alt={b.name} type={b.type} sizes="88px" iconSize={26} />
        </div>
        <div className={styles.rowBody}>
          <div className={styles.rowHead}>
            <div className={styles.name}>{b.name}</div>
            <span className={styles.rowStatus}>{status}</span>
          </div>
          <div className={styles.foot}>{figures}{actions}</div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="billboard-card" style={tone}
      className={`${styles.card} ${isCompared ? styles.compared : ""} ${b.featured ? "gradient-frame" : ""}`}>
      <div className={styles.photo}>
        <div className={`${styles.zoom} card-photo-zoom`}>
          {/* A grid card is 320–400 CSS px wide: the 384 variant at 1x, the
              500-wide source at 2x. */}
          <MediaImage src={b.images?.[0]} alt={b.name} type={b.type} sizes="(max-width: 700px) 100vw, 384px" />
        </div>
        <div className={`${styles.badge} ${styles.glass} ${styles.type}`}>{typeLabels[b.type]}</div>
        <div className={`${styles.badge} ${styles.status}`}>{status}</div>
        {/* The only thing a paid promotion buys: this and the top of the results. */}
        {b.featured && <div className={`${styles.badge} ${styles.featured}`}><Sparkles size={11} /> ویژه</div>}
        {b.reviewCount > 0 && (
          <div className={`${styles.badge} ${styles.glass} ${styles.rating}`}>
            <Star size={11} fill="currentColor" /> {b.rating} ({b.reviewCount})
          </div>
        )}
      </div>
      <div className={styles.body}>
        <div className={styles.name}>{b.name}</div>
        <div className={styles.foot}>{figures}{actions}</div>
      </div>
    </div>
  );
}
