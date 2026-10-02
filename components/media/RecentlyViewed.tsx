"use client";
import { History, MapPin, X } from "lucide-react";
import IntentLink from "@/components/ui/IntentLink";
import MediaImage from "@/components/media/MediaImage";
import { forgetViewed, useRecentlyViewed } from "@/lib/client/recently-viewed";
import { faMillions } from "@/lib/format";
import styles from "./recent.module.css";

/**
 * The media this browser opened last, as a row of small cards. Absent until
 * the list has something in it; the server never knows the list exists.
 */
export default function RecentlyViewed({ exclude }: { exclude?: string }) {
  const list = useRecentlyViewed().filter(m => m.slug !== exclude);
  if (list.length === 0) return null;

  return (
    <section className={styles.recent} aria-labelledby="recent-title">
      <div className={styles.head}>
        <h2 id="recent-title" className={styles.title}><History size={18} /> اخیراً دیده‌اید</h2>
        <button type="button" className={styles.clear} onClick={forgetViewed}>
          <X size={13} /> پاک کردن
        </button>
      </div>
      <p className={styles.note}>فقط روی همین دستگاه نگه داشته می‌شود.</p>
      <ul className={styles.row}>
        {list.map(m => (
          <li key={m.slug}>
            <IntentLink href={`/billboard/${m.slug}`} className={styles.card}>
              <div className={styles.photo}>
                {/* Not lazy: off to the side of a sideways row it would never load (§24). */}
                <MediaImage src={m.image} alt={m.name} type={m.type} sizes="200px" eager iconSize={24} />
              </div>
              <div className={styles.body}>
                <div className={styles.name}>{m.name}</div>
                <div className={styles.meta}>
                  <span><MapPin size={11} /> {m.city}</span>
                  <strong>{faMillions(m.price)}</strong>
                </div>
              </div>
            </IntentLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
