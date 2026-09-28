"use client";
import { useState } from "react";
import Image from "next/image";
import { Megaphone, Monitor, Milestone, Train, Bus } from "lucide-react";
import styles from "./MediaImage.module.css";

/**
 * A media photo, and the one placeholder for when there is none or it fails
 * to load: the media type's icon on its colour, never a broken-image icon.
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
  // Unique per type, or the first <defs> would win for the whole document.
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
 * Fills its positioned parent. `sizes` is required: it lets image-loader.js
 * pick a pre-built variant (§22c), and forgetting it would fail silently.
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
