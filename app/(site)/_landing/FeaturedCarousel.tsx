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
 *
 * It moves on its own only while nobody is reading it (WCAG 2.2.2): not under
 * a pointer or keyboard focus, not off screen or in a hidden tab, never with
 * reduced motion, and not again once the visitor has used the arrows or dots —
 * it used to rotate every four seconds whatever anyone was doing.
 */
export default function FeaturedCarousel({ items }: { items: CatalogueItem[] }) {
  const [index, setIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  const [held, setHeld] = useState(false);
  const [userDriven, setUserDriven] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const rotating = items.length > 1 && onScreen && !held && !userDriven;
  useEffect(() => {
    if (!rotating || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex(i => (i + 1) % items.length);
    }, HOLD_MS);
    return () => clearInterval(timer);
  }, [rotating, items.length]);

  const show = (i: number) => {
    setIndex((i + items.length) % items.length);
    setUserDriven(true);
  };

  return (
    <div className={styles.carousel} ref={rootRef}
      onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false); }}>
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

      <button type="button" className={`${styles.arrow} ${styles.prev}`} onClick={() => show(index - 1)} aria-label="رسانهٔ قبلی"><ChevronRight size={22} /></button>
      <button type="button" className={`${styles.arrow} ${styles.next}`} onClick={() => show(index + 1)} aria-label="رسانهٔ بعدی"><ChevronLeft size={22} /></button>

      <div className={styles.dots}>
        {items.map((b, i) => (
          <button key={b.id} type="button" onClick={() => show(i)}
            className={`${styles.dot} ${i === index ? styles.dotActive : ""} carousel-dot`}
            aria-label={`نمایش رسانهٔ ${faNum(i + 1)}`} aria-current={i === index} />
        ))}
      </div>
    </div>
  );
}
