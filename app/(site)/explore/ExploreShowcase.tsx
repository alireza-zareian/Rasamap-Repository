"use client";
import { useState, useEffect, useRef } from "react";
import IntentLink from "@/components/ui/IntentLink";
import { MapPin, Building2 } from "lucide-react";
import MediaImage from "@/components/media/MediaImage";
import type { CatalogueItem } from "@/lib/types";
import { faNum, faMillions } from "@/lib/format";
import styles from "./explore.module.css";

/** How long each slide is held before the next one fades in. */
const SLIDE_MS = 5500;

/**
 * The photo carousel beside the catalogue's search panel (desktop only). A
 * client component for the auto-advance and dots; the first slide is in the
 * HTML.
 *
 * On a phone the module hides it, and a hidden carousel still turned: each
 * slide was a new photo, one every 5.5 s for as long as the page stayed open
 * (measured: 6.0, 11.5, 17.0, 22.5 s after load). So the timer runs only while
 * the carousel is on screen — which `display: none` never is, and neither is a
 * carousel the visitor has scrolled past to read the results — and the tab is
 * visible. The photo is lazy: a lazy image under `display: none` is never
 * requested, and on a wide screen the showcase is in the first viewport,
 * where lazy loads at once.
 */
export default function ExploreShowcase({ items }: { items: CatalogueItem[] }) {
  const [idx, setIdx] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  // Held while a pointer or keyboard focus is on it, and never turning under
  // reduced motion (WCAG 2.2.2), like the landing carousel.
  const [held, setHeld] = useState(false);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (items.length < 2 || held || !onScreen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (!document.hidden) setIdx(i => (i + 1) % items.length);
    }, SLIDE_MS);
    return () => clearInterval(id);
  }, [items.length, held, onScreen]);

  const current = items[idx];
  if (!current) {
    return (
      <div className={styles.showcase}>
        <div className={styles.noPhotos}><Building2 size={40} strokeWidth={1.4} /> تصویری برای نمایش نیست</div>
      </div>
    );
  }

  return (
    <div ref={root} className={styles.showcase}
      onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false); }}>
      {/* key restarts the fade on each slide */}
      <div key={idx} className={styles.slide}>
        <MediaImage src={current.images?.[0]} alt={current.name} type={current.type} sizes="(max-width: 900px) 100vw, 360px" />
        <div className={styles.shade} />
      </div>
      <div className={styles.caption}>
        <div className={styles.pill}>پربازدیدترین رسانه‌ها</div>
        <div className={styles.slideName}>{current.name}</div>
        <div className={styles.slideFoot}>
          <div className={styles.slidePlace}><MapPin size={11} /> {current.region} · {current.location}</div>
          <div className={styles.slideCta}>
            <strong>{faMillions(current.price)} تومان</strong>
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
