"use client";
import { useState, useEffect, useCallback } from "react";
import { ImageOff, Search, X, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  images: string[];
  name: string;
}

export default function BillboardGallery({ images, name }: Props) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const prev = useCallback(() => setActive(i => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setActive(i => (i + 1) % images.length), [images.length]);

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
      {/* Main image */}
      <div
        style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 16, overflow: "hidden", cursor: "zoom-in", background: "var(--bg-surface)" }}
        onClick={() => setLightbox(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[active]} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {images.length > 1 && (
          <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "3px 12px", fontSize: "0.72rem", color: "#fff", backdropFilter: "blur(4px)" }}>
            {active + 1} / {images.length}
          </div>
        )}
        <div style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.55)", borderRadius: 8, padding: "4px 10px", fontSize: "0.7rem", color: "#fff", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", gap: 5 }}><Search size={12} /> بزرگ‌نمایی</div>
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto", paddingBottom: 4 }}>
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              style={{ flexShrink: 0, width: 72, height: 52, borderRadius: 9, overflow: "hidden", border: i === active ? "2px solid var(--accent)" : "2px solid var(--border)", padding: 0, cursor: "pointer", background: "var(--bg-surface)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setLightbox(false)}
        >
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[active]} alt={name} style={{ width: "90vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 12, display: "block" }} />
            {images.length > 1 && (
              <>
                <button onClick={prev} style={{ position: "absolute", top: "50%", right: -52, transform: "translateY(-50%)", background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", width: 40, height: 40, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={22} /></button>
                <button onClick={next} style={{ position: "absolute", top: "50%", left: -52, transform: "translateY(-50%)", background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", width: 40, height: 40, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={22} /></button>
              </>
            )}
            <button onClick={() => setLightbox(false)} style={{ position: "absolute", top: -16, left: -16, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
            <div style={{ position: "absolute", bottom: -28, left: "50%", transform: "translateX(-50%)", fontSize: "0.72rem", color: "rgba(255,255,255,0.6)" }}>{active + 1} / {images.length}</div>
          </div>
        </div>
      )}
    </>
  );
}
