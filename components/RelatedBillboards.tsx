import IntentLink from "@/components/ui/IntentLink";
import { MapPin } from "lucide-react";
import MediaImage from "@/components/MediaImage";
import type { CatalogueItem } from "@/lib/types";
import { typeLabels } from "@/lib/types";
import SwipeMarquee from "@/components/SwipeMarquee";
import { faNum } from "@/lib/format";
import { cssVar } from "@/components/ui/css-var";
import styles from "./detail.module.css";

const TYPE_LABEL = typeLabels as Record<string, string>;

/**
 * Foot-of-page carousel of related media (same neighbourhood or same media
 * type). A pure-CSS marquee: the strip holds the list twice and slides -50%, so
 * it loops with no seam and no JS — the same mechanism as the home page live
 * ticker. `.related-strip` pauses on hover and, under prefers-reduced-motion,
 * the animation stops and `.related-marquee` becomes a normal scroll container.
 * Those two stay global in globals.css because the ticker shares them and the
 * hidden-tab pause list names them.
 */
export default function RelatedBillboards({ items }: { items: CatalogueItem[] }) {
  if (!items || items.length === 0) return null;

  // Duplicated once for the seamless -50% loop. Scale the duration with the
  // item count so the on-screen speed stays roughly constant (~4s per card).
  const loop = [...items, ...items];
  const duration = Math.max(18, items.length * 4);

  return (
    <section className={styles.related}>
      <div className={styles.relatedHead}>
        <h2>رسانه‌های مرتبط</h2>
        <p>در همین منطقه یا از همین نوع رسانه</p>
      </div>

      <SwipeMarquee className={`${styles.relatedWindow} related-marquee`}>
        <div className={`${styles.relatedStrip} related-strip`} style={cssVar("--duration", `${duration}s`)}>
          {loop.map((b, i) => {
            const clone = i >= items.length;
            return (
              <IntentLink
                key={`${b.id}-${i}`}
                href={`/billboard/${b.slug}`}
                className={styles.relatedCard}
                aria-hidden={clone || undefined}
                tabIndex={clone ? -1 : undefined}
              >
                <div className={styles.relatedPhoto}>
                  {/* Not lazy: this strip scrolls itself with a CSS animation inside
                      overflow:hidden, so a card off to the side never enters the
                      viewport and a lazy image is never requested (§24). */}
                  <MediaImage src={b.images?.[0]} alt={b.name} type={b.type} sizes="230px" eager iconSize={28} />
                  <span className={styles.relatedType}>{TYPE_LABEL[b.type] ?? b.type}</span>
                </div>
                <div className={styles.relatedBody}>
                  <div className={styles.relatedName}>{b.name}</div>
                  <div className={styles.relatedCity}><MapPin size={11} /> {b.city}</div>
                  <div className={styles.relatedPrice}>
                    <strong>{faNum(b.price)}</strong>
                    <span>میلیون تومان / ماه</span>
                  </div>
                </div>
              </IntentLink>
            );
          })}
        </div>
      </SwipeMarquee>
    </section>
  );
}
