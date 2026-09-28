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
 * Related media under a media page, as a CSS marquee (globals.css): the list
 * twice, sliding -50%, no JavaScript per frame.
 */
export default function RelatedBillboards({ items }: { items: CatalogueItem[] }) {
  if (!items || items.length === 0) return null;

  // About 4 s per card, whatever the count.
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
                  {/* Not lazy: off to the side in the marquee, a lazy image never loads (§24). */}
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
