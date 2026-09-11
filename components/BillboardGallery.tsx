"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { ImageOff, Search, X, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  images: string[];
  name: string;
}

// Below this, a horizontal drag counts as a swipe rather than a stray touch.
const SWIPE_PX = 45;

export default function BillboardGallery({ images, name }: Props) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const prev = useCallback(() => setActive(i => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setActive(i => (i + 1) % images.length), [images.length]);

  // Touch swipe — the only way to move between images on a phone, where the
  // lightbox arrows sit at the screen edge and there is no keyboard.
  const touchX = useRef<number | null>(null);
  const swipedAt = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null || images.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < SWIPE_PX) return;
    swipedAt.current = Date.now();
    // Drag left → next image, drag right → previous — the convention every
    // photo viewer uses, RTL page or not.
    (dx < 0 ? next : prev)();
  };
  // A swipe ends in a synthetic click; on the main image that would pop the
  // lightbox open, so swallow the click that lands right after one.
  const openLightbox = () => { if (Date.now() - swipedAt.current > 250) setLightbox(true); };

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Escape") setLightbox(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, prev, next]);

  if (!images.length) {
    return (
      <div style={{ width: "100%", aspectRatio: "16/9", background: "var(--bg-surface)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
        <ImageOff size={48} strokeWidth={1.4} />
      </div>
    );
  }

  return (
    <>
      {/* Main image — a real <button>, not a div with onClick. The lightbox
          was reachable only by pointer before: nothing about a clickable div
          reaches the tab order, so a keyboard could not open the photographs
          at all. `type="button"` keeps it out of any surrounding form. */}
      <button
        type="button"
        onClick={openLightbox}
        aria-label={`بزرگ‌نمایی تصویر ${name}`}
        style={{ position: "relative", display: "block", width: "100%", aspectRatio: "16/9", borderRadius: 16, overflow: "hidden", cursor: "zoom-in", background: "var(--bg-surface)", border: "none", padding: 0, font: "inherit" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Image src={images[active]} alt={name} fill sizes="(max-width: 900px) 100vw, 640px"
          decoding="async" priority style={{ objectFit: "cover" }} />
        {images.length > 1 && (
          <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "3px 12px", fontSize: "0.72rem", color: "#fff", backdropFilter: "blur(4px)" }}>
            {active + 1} / {images.length}
          </div>
        )}
        <div style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.55)", borderRadius: 8, padding: "4px 10px", fontSize: "0.7rem", color: "#fff", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", gap: 5 }}><Search size={12} /> بزرگ‌نمایی</div>
      </button>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto", paddingBottom: 4 }}>
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`نمایش تصویر ${i + 1} از ${images.length}`}
              aria-current={i === active}
              style={{ flexShrink: 0, width: 72, height: 52, borderRadius: 9, overflow: "hidden", border: i === active ? "2px solid var(--accent)" : "2px solid var(--border)", padding: 0, cursor: "pointer", background: "var(--bg-surface)" }}
            >
              <Image src={src} alt="" width={72} height={52} sizes="72px" loading="lazy" decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`تصاویر ${name}`}
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setLightbox(false)}
        >
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }} onClick={e => e.stopPropagation()}
            onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <Image src={images[active]} alt={name} width={500} height={500} sizes="90vw"
              style={{ width: "90vw", height: "auto", maxHeight: "88vh", objectFit: "contain", borderRadius: 12, display: "block" }} />
            {images.length > 1 && (
              <>
                <button type="button" onClick={prev} aria-label="تصویر قبلی" className="gallery-arrow gallery-arrow-prev" style={{ position: "absolute", top: "50%", right: -52, transform: "translateY(-50%)", background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", width: 40, height: 40, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={22} /></button>
                <button type="button" onClick={next} aria-label="تصویر بعدی" className="gallery-arrow gallery-arrow-next" style={{ position: "absolute", top: "50%", left: -52, transform: "translateY(-50%)", background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", width: 40, height: 40, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={22} /></button>
              </>
            )}
            <button type="button" onClick={() => setLightbox(false)} aria-label="بستن نمای بزرگ" style={{ position: "absolute", top: -16, left: -16, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
            <div style={{ position: "absolute", bottom: -28, left: "50%", transform: "translateX(-50%)", fontSize: "0.72rem", color: "rgba(255,255,255,0.6)" }}>{active + 1} / {images.length}</div>
          </div>
        </div>
      )}
    </>
  );
}
