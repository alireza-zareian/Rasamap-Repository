"use client";
import { useEffect, useRef, useState } from "react";
import IntentLink from "@/components/ui/IntentLink";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import MediaImage from "@/components/media/MediaImage";
import type { CatalogueItem } from "@/lib/types";
import { faNum } from "@/lib/format";
import styles from "./landing.module.css";

/** How long each card holds before the strip moves on. */
const HOLD_MS = 4000;
/** Card width plus the gap between cards — what one step moves. */
const STEP = "(var(--slide-w, 280px) + 16px)";

/**
 * The busiest photographed media, sliding by one card every few seconds. The
 * strip repeats its first four so the last step lands on a full row.
 */
export default function FeaturedCarousel({ items }: { items: CatalogueItem[] }) {
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const restart = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setIndex(i => (i + 1) % items.length), HOLD_MS);
  };

  useEffect(() => {
    if (items.length < 2) return;
    restart();
    return () => { if (timer.current) clearInterval(timer.current); };
    // restart only reads refs and the length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const go = (dir: 1 | -1) => {
    setIndex(i => (i + dir + items.length) % items.length);
    restart();
  };

  return (
    <div className={styles.carousel}>
      <div className={styles.viewport}>
        <div className={styles.track} style={{ transform: `translateX(calc(${index} * ${STEP}))` }}>
          {[...items, ...items.slice(0, 4)].map((b, i) => (
            <IntentLink key={i} href={`/billboard/${b.slug}`} className={styles.slide} tabIndex={i >= items.length ? -1 : undefined}>
              {/* Not lazy: off-screen in a translated strip, a lazy image never loads (rule 9). */}
              <MediaImage src={b.images?.[0]} alt={b.name} type={b.type} sizes="280px" eager />
              <div className={styles.slideShade} />
              <div className={styles.slideText}>
                <div className={styles.slideCity}><MapPin size={10} /> {b.city}</div>
                <div className={styles.slideName}>{b.name}</div>
                <div className={styles.slidePrice}>
                  <strong>{faNum(b.price)}M</strong>
                  <span>تومان/ماه</span>
                </div>
              </div>
            </IntentLink>
          ))}
        </div>
      </div>

      <button type="button" className={`${styles.arrow} ${styles.prev}`} onClick={() => go(-1)} aria-label="رسانهٔ قبلی"><ChevronRight size={22} /></button>
      <button type="button" className={`${styles.arrow} ${styles.next}`} onClick={() => go(1)} aria-label="رسانهٔ بعدی"><ChevronLeft size={22} /></button>

      <div className={styles.dots}>
        {items.map((b, i) => (
          <button key={b.id} type="button" onClick={() => { setIndex(i); restart(); }}
            className={`${styles.dot} ${i === index ? styles.dotActive : ""} carousel-dot`}
            aria-label={`نمایش رسانهٔ ${faNum(i + 1)}`} aria-current={i === index} />
        ))}
      </div>
    </div>
  );
}
