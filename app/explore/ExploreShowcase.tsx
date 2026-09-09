"use client";
import { useState, useEffect } from "react";
import MediaImage from "@/components/MediaImage";
import { MapPin, Building2 } from "lucide-react";
import { useTheme } from "@/lib/theme";
import type { CatalogueItem } from "@/lib/types";
import { faNum } from "@/lib/format";

/**
 * The photo carousel beside the catalogue's search panel.
 *
 * The slides arrive from the server already chosen, so the first one is in the
 * HTML: before V1 this panel fetched twenty records from the JSON API on mount
 * and showed a "loading images" placeholder until they landed.
 *
 * Client only for the auto-advance and the dots. Images carry no
 * `loading="lazy"`: the strip lives in an `overflow:hidden` box and every slide
 * past the first is outside the viewport, so a lazy image would never be
 * requested (rule 9 in AGENTS.md).
 */

/** How long each slide is held before the next one fades in. */
const SLIDE_MS = 5500;

export default function ExploreShowcase({ items }: { items: CatalogueItem[] }) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setIdx(i => (i + 1) % items.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [items.length]);

  const current = items[idx];

  return (
    <div className="explore-hero-showcase" style={{ position: "relative", overflow: "hidden", aspectRatio: "1 / 1", alignSelf: "start", background: "var(--bg-card)" }}>
      {current ? (
        <>
          {/* key triggers fadeIn on each slide change */}
          <div key={idx} style={{ position: "absolute", inset: 0, animation: "fadeIn 0.6s ease" }}>
            {/* eager for the same reason the strip below the fold is: only the
                current slide is in the DOM and it is already on screen. */}
            <MediaImage
              src={current.images?.[0]}
              alt={current.name}
              type={current.type}
              sizes="(max-width: 900px) 100vw, 360px"
              eager
            />
            {/* Dark gradient for text legibility — always dark since image fills entirely */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(to top, rgba(5,10,20,0.88) 0%, rgba(5,10,20,0.12) 50%, transparent 100%)",
            }} />
          </div>

          <div style={{ position: "absolute", bottom: 0, right: 0, left: 0, padding: "16px 20px" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(0,209,122,0.12)", border: "1px solid rgba(0,209,122,0.30)",
              borderRadius: 20, padding: "3px 10px", marginBottom: 8,
              fontSize: "0.68rem", color: "var(--green-accent)", fontWeight: 600,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green-accent)" }} />
              پربازدیدترین رسانه‌ها
            </div>

            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: 4, lineHeight: 1.3 }}>
              {current.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.65)", display: "flex", alignItems: "center", gap: 4 }}>
                <MapPin size={11} /> {current.region} · {current.location.substring(0, 35)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginRight: 8 }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "var(--accent-warm)" }}>{faNum(current.price)}M تومان</span>
                <a href={`/billboard/${current.slug}`} style={{ fontSize: "0.72rem", fontWeight: 700, color: "#fff", background: "var(--accent)", padding: "3px 10px", borderRadius: 6, textDecoration: "none", whiteSpace: "nowrap" }}>مشاهده رسانه ←</a>
              </div>
            </div>

            <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
              {items.map((b, i) => (
                <button
                  key={b.id}
                  onClick={() => setIdx(i)}
                  aria-label={`نمایش رسانهٔ ${i + 1}`}
                  style={{
                    width: i === idx ? 18 : 6,
                    height: 6, borderRadius: 3,
                    background: i === idx ? "var(--accent)" : dark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.20)",
                    border: "none", cursor: "pointer", padding: 0,
                    transition: "width 0.3s ease, background 0.2s",
                  }}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        /* No photographed media at all — the catalogue still works without it. */
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", flexDirection: "column", gap: 8, color: "var(--text-muted)",
        }}>
          <div style={{ opacity: 0.3, display: "flex" }}><Building2 size={40} strokeWidth={1.4} /></div>
          <div style={{ fontSize: "0.75rem" }}>تصویری برای نمایش نیست</div>
        </div>
      )}
    </div>
  );
}
