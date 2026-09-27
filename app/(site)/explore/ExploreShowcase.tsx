"use client";
import { useState, useEffect } from "react";
import IntentLink from "@/components/ui/IntentLink";
import { MapPin, Building2 } from "lucide-react";
import MediaImage from "@/components/MediaImage";
import type { CatalogueItem } from "@/lib/types";
import { faNum } from "@/lib/format";
import styles from "./explore.module.css";

/** How long each slide is held before the next one fades in. */
const SLIDE_MS = 5500;

/**
 * The photo carousel beside the catalogue's search panel (desktop only — on a
 * phone it hid the first result). The slides arrive from the server, so the
 * first is in the HTML; this is a client component only for the auto-advance
 * and the dots. The image is eager: only the current slide is in the DOM, and
 * it is already on screen.
 */
export default function ExploreShowcase({ items }: { items: CatalogueItem[] }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setIdx(i => (i + 1) % items.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [items.length]);

  const current = items[idx];
  if (!current) {
    return (
      <div className={styles.showcase}>
        <div className={styles.noPhotos}><Building2 size={40} strokeWidth={1.4} /> تصویری برای نمایش نیست</div>
      </div>
    );
  }

  return (
    <div className={styles.showcase}>
      {/* key restarts the fade on each slide */}
      <div key={idx} className={styles.slide}>
        <MediaImage src={current.images?.[0]} alt={current.name} type={current.type} sizes="(max-width: 900px) 100vw, 360px" eager />
        <div className={styles.shade} />
      </div>
      <div className={styles.caption}>
        <div className={styles.pill}>پربازدیدترین رسانه‌ها</div>
        <div className={styles.slideName}>{current.name}</div>
        <div className={styles.slideFoot}>
          <div className={styles.slidePlace}><MapPin size={11} /> {current.region} · {current.location}</div>
          <div className={styles.slideCta}>
            <strong>{faNum(current.price)}M تومان</strong>
            <IntentLink href={`/billboard/${current.slug}`}>مشاهدهٔ رسانه ←</IntentLink>
          </div>
        </div>
        {/* gap 18: two 24px dot targets meet without overlapping — see .carousel-dot */}
        <div className={styles.dots}>
          {items.map((b, i) => (
            <button key={b.id} type="button" className={`${styles.slideDot} carousel-dot`} onClick={() => setIdx(i)}
              aria-label={`نمایش رسانهٔ ${faNum(i + 1)}`} aria-current={i === idx} />
          ))}
        </div>
      </div>
    </div>
  );
}
