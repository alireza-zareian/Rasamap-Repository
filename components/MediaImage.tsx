"use client";
import { useState } from "react";
import Image from "next/image";
import { Megaphone, Monitor, Milestone, Train, Bus } from "lucide-react";
import styles from "./MediaImage.module.css";

/**
 * A photo of a media item, with the one thing every photo on this site needs:
 * something to show when the photo is not there.
 *
 * Two cases, one answer. A record with no photograph at all — about 43% of the
 * catalogue — and a record whose photograph fails to load. Only the first was
 * handled, and only on the catalogue card; the hero carousel, the landing
 * gallery, the related strip and the detail gallery all rendered the browser's
 * broken-image icon instead. The browser tests found it, because that is the
 * kind of thing a request-level test cannot see (the server answered 200 and
 * the page was still wrong).
 *
 * §5 of the audit rules: the unhappy path is a designed screen, not an
 * accident. So a missing photo is a typed placeholder — the media's own icon on
 * its own colour — rather than a torn page.
 *
 * Also the single definition of that placeholder, which used to live inside
 * BillboardCard where nothing else could reach it.
 */

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  billboard: Megaphone,
  digital:   Monitor,
  bridge:    Milestone,
  station:   Train,
  vehicle:   Bus,
};

export function NoImagePlaceholder({ type, iconSize = 34 }: { type: string; iconSize?: number }) {
  const Icon = TYPE_ICONS[type] ?? Megaphone;
  // The pattern id must be unique per type or one <defs> wins for the whole
  // document and every card gets the first card's stripes.
  const patternId = `media-hatch-${type}`;
  return (
    <div data-testid="media-placeholder" className={`${styles.placeholder} ${styles[type] ?? ""}`}>
      <svg className={styles.hatch} aria-hidden="true">
        <defs>
          <pattern id={patternId} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="18" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      <div className={styles.mark}>
        <div className={styles.ring} />
        <span className={styles.icon}><Icon size={iconSize} color="rgba(255,255,255,0.92)" /></span>
      </div>
    </div>
  );
}

/**
 * Fills its parent, which must be positioned. `sizes` is required rather than
 * optional on purpose: it is what lets image-loader.js pick a pre-built variant
 * instead of the full-size original (§22c), and forgetting it is silent.
 */
export default function MediaImage({
  src,
  alt,
  type,
  sizes,
  eager = false,
  iconSize,
}: {
  src: string | undefined;
  alt: string;
  type: string;
  sizes: string;
  /** Carousels and marquees must not be lazy — they never scroll into view (§24). */
  eager?: boolean;
  iconSize?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return <NoImagePlaceholder type={type} iconSize={iconSize} />;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed(true)}
      className={styles.photo}
    />
  );
}
