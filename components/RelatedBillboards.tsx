import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Billboard } from "@/lib/types";
import { typeLabels } from "@/lib/types";
import { TypeIcon } from "@/components/TypeIcon";
import SwipeMarquee from "@/components/SwipeMarquee";

const TYPE_LABEL = typeLabels as Record<string, string>;

/**
 * Foot-of-page carousel of related media (same neighbourhood or same media
 * type). A pure-CSS marquee: the strip holds the list twice and slides -50%, so
 * it loops with no seam and no JS — the same mechanism as the home page live
 * ticker. `.related-strip` pauses on hover and, under prefers-reduced-motion,
 * the animation stops and `.related-marquee` becomes a normal scroll container
 * (rules live in globals.css).
 */
export default function RelatedBillboards({ items }: { items: Billboard[] }) {
  if (!items || items.length === 0) return null;

  // Duplicated once for the seamless -50% loop. Scale the duration with the
  // item count so the on-screen speed stays roughly constant (~4s per card).
  const loop = [...items, ...items];
  const duration = Math.max(18, items.length * 4);

  return (
    <section style={{ borderTop: "1px solid var(--border)", background: "var(--bg-deep)", padding: "40px 0 48px", overflow: "hidden" }}>
      <div style={{ maxWidth: 1350, margin: "0 auto", padding: "0 20px 18px" }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>رسانه‌های مرتبط</h2>
        <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 4 }}>
          در همین منطقه یا از همین نوع رسانه
        </div>
      </div>

      <SwipeMarquee
        className="related-marquee"
        style={{
          maskImage: "linear-gradient(to left, transparent, #000 6%, #000 94%, transparent)",
          WebkitMaskImage: "linear-gradient(to left, transparent, #000 6%, #000 94%, transparent)",
        }}
      >
        <div
          className="related-strip"
          style={{ display: "flex", gap: 16, width: "max-content", padding: "4px 20px", animation: `relatedScroll ${duration}s linear infinite` }}
        >
          {loop.map((b, i) => {
            const clone = i >= items.length;
            return (
              <Link
                key={`${b.id}-${i}`}
                href={`/billboard/${b.slug}`}
                aria-hidden={clone || undefined}
                tabIndex={clone ? -1 : undefined}
                style={{ flexShrink: 0, width: 230, borderRadius: 14, overflow: "hidden", textDecoration: "none", color: "var(--text-main)", background: "var(--bg-card)", border: "1px solid var(--border)", display: "block" }}
              >
                <div style={{ position: "relative", aspectRatio: "16 / 10", background: "var(--bg-surface)" }}>
                  {b.images?.[0] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={b.images[0]}
                      alt={b.name}
                      decoding="async"
                      /* Not lazy: this strip scrolls itself with a CSS animation
                         inside overflow:hidden, so a card off to the side never
                         enters the viewport and a lazy image is never requested —
                         the same fault that left the landing carousel and the
                         detail map blank on a phone (§24). At most a dozen photos,
                         all of which scroll past within one loop. */
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", opacity: 0.5 }}>
                      <TypeIcon type={b.type} size={34} />
                    </div>
                  )}
                  <span style={{ position: "absolute", top: 8, right: 8, fontSize: "0.62rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(255,77,0,0.12)", color: "var(--accent)", backdropFilter: "blur(4px)" }}>
                    {TYPE_LABEL[b.type] ?? b.type}
                  </span>
                </div>
                <div style={{ padding: "10px 12px 12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, lineHeight: 1.4, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{b.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5, fontSize: "0.68rem", color: "var(--text-muted)" }}>
                    <MapPin size={11} /> {b.city}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--accent)" }}>{b.price.toLocaleString()}</span>
                    <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>میلیون تومان / ماه</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </SwipeMarquee>
    </section>
  );
}
