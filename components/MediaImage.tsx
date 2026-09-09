"use client";
import { useState } from "react";
import Image from "next/image";
import { Megaphone, Monitor, Milestone, Train, Bus } from "lucide-react";

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

const TYPE_THEMES: Record<string, { grad: string; ring: string; glow: string }> = {
  billboard: { grad: "linear-gradient(135deg,#2d1b69 0%,#11093a 100%)", ring: "rgba(129,140,248,0.3)",  glow: "rgba(129,140,248,0.7)" },
  digital:   { grad: "linear-gradient(135deg,#0c3d52 0%,#041520 100%)", ring: "rgba(56,189,248,0.3)",   glow: "rgba(56,189,248,0.7)"  },
  bridge:    { grad: "linear-gradient(135deg,#4a1535 0%,#1a0514 100%)", ring: "rgba(244,114,182,0.3)",  glow: "rgba(244,114,182,0.7)" },
  station:   { grad: "linear-gradient(135deg,#4a2b08 0%,#1a0e02 100%)", ring: "rgba(251,191,36,0.3)",   glow: "rgba(251,191,36,0.7)"  },
  vehicle:   { grad: "linear-gradient(135deg,#0d3d1f 0%,#04140b 100%)", ring: "rgba(74,222,128,0.3)",   glow: "rgba(74,222,128,0.7)"  },
};
const DEFAULT_THEME = { grad: "linear-gradient(135deg,#1a2640 0%,#0d1520 100%)", ring: "rgba(148,163,184,0.25)", glow: "rgba(148,163,184,0.6)" };

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  billboard: Megaphone,
  digital:   Monitor,
  bridge:    Milestone,
  station:   Train,
  vehicle:   Bus,
};

export function NoImagePlaceholder({ type, iconSize = 34 }: { type: string; iconSize?: number }) {
  const t = TYPE_THEMES[type] ?? DEFAULT_THEME;
  const Icon = TYPE_ICONS[type] ?? Megaphone;
  // The pattern id must be unique per type or one <defs> wins for the whole
  // document and every card gets the first card's stripes.
  const patternId = `media-hatch-${type}`;
  return (
    <div data-testid="media-placeholder" style={{ position: "absolute", inset: 0, background: t.grad, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.07 }} aria-hidden="true">
        <defs>
          <pattern id={patternId} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="18" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      <div style={{ position: "relative", width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: -8, borderRadius: "50%", background: t.ring, boxShadow: `0 0 24px 6px ${t.ring}` }} />
        <span style={{ position: "relative", filter: `drop-shadow(0 0 12px ${t.glow})` }}>
          <Icon size={iconSize} color="rgba(255,255,255,0.92)" />
        </span>
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
      style={{ objectFit: "cover" }}
    />
  );
}
