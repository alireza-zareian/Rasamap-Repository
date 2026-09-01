"use client";
import { useEffect, useState } from "react";
import { Billboard, typeLabels } from "@/lib/data";
import TrafficMeter from "./TrafficMeter";

interface Props {
  billboard: Billboard | null;
  onClose: () => void;
  onBook: () => void;
  onCompare: () => void;
  isCompared: boolean;
}

export default function DetailModal({ billboard: b, onClose, onBook, onCompare, isCompared }: Props) {
  const [imgError, setImgError] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => { setImgError(false); setLightbox(false); }, [b?.id]);

  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox]);

  if (!b) return null;
  const statusColor = b.status === "available" ? "var(--green)" : "var(--red)";
  const img = b.images?.[0] ?? "";
  const showImage = !!img && !imgError;

  return (
    <>
      {/* ── Lightbox ──────────────────────────────────────────── */}
      {lightbox && showImage && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 600,
            background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt={b.name}
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: "min(92vw, 1100px)", maxHeight: "90vh",
              objectFit: "contain", borderRadius: 10,
              boxShadow: "0 32px 100px rgba(0,0,0,0.9)",
              cursor: "default", userSelect: "none",
            }}
          />
          <button
            onClick={() => setLightbox(false)}
            style={{
              position: "fixed", top: 18, right: 18,
              background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff", borderRadius: "50%", width: 38, height: 38,
              fontSize: "1.1rem", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(4px)",
            }}
            aria-label="بستن پیش‌نمایش"
          >✕</button>
        </div>
      )}

      {/* ── Detail modal ──────────────────────────────────────── */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(6,10,18,0.88)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh",
          overflowY: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
          animation: "fadeIn 0.25s ease",
        }}>
          {/* Header */}
          <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.4 }}>{b.name}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 3 }}>
                {b.region} · {typeLabels[b.type]} ·{" "}
                <span style={{ color: statusColor, fontWeight: 600 }}>
                  {b.status === "available" ? "✅ خالی" : "🔴 مشغول"}
                </span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "1.3rem", cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
          </div>

          <div style={{ padding: "18px 22px" }}>
            {/* Hero */}
            <div
              onClick={() => showImage && setLightbox(true)}
              style={{
                height: 160, background: "var(--bg-surface)", borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "4rem", marginBottom: 16, border: "1px solid var(--border)",
                position: "relative", overflow: "hidden",
                cursor: showImage ? "zoom-in" : "default",
              }}
            >
              {showImage ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="" aria-hidden="true"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(22px) brightness(0.55)", transform: "scale(1.15)" }}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt={b.name}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                    onError={() => setImgError(true)}
                  />
                </>
              ) : (
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#1C2333,#0A0E1A)" }} />
              )}
              {!showImage && (
                <span style={{ position: "relative", filter: "drop-shadow(0 0 30px rgba(59,123,245,0.4))" }}>{b.icon}</span>
              )}
              <div style={{ position: "absolute", top: 10, left: 10, background: `${statusColor}18`, border: `1px solid ${statusColor}44`, borderRadius: 6, padding: "3px 10px", fontSize: "0.72rem", color: statusColor, fontWeight: 600 }}>
                {b.status === "available" ? "● خالی" : "● مشغول"}
              </div>
              <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(10,14,26,0.85)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", fontSize: "0.7rem", color: "var(--accent-warm)" }}>
                ★ {b.rating} ({b.reviewCount} نظر)
              </div>
            </div>

            <TrafficMeter traffic={b.traffic} />

            {/* Stats grid */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>مشخصات رسانه</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["ابعاد", `${b.width} × ${b.height} متر`],
                  ["مساحت", `${b.width * b.height} متر مربع`],
                  ["تعداد وجوه", `${b.faces} وجه`],
                  ["سن سازه", `${b.age} سال`],
                  ["منطقه", b.region],
                  ["آژانس", b.agency],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: "var(--bg-surface)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 3 }}>{l}</div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Location */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>موقعیت</div>
              <div style={{ background: "var(--bg-surface)", borderRadius: 8, padding: "10px 14px", fontSize: "0.83rem", lineHeight: 1.6 }}>
                📍 {b.location}
              </div>
            </div>

            {/* Nearby */}
            {b.nearbyLandmarks.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>نقاط مجاور</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {b.nearbyLandmarks.map(l => (
                    <span key={l} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "3px 12px", fontSize: "0.75rem", color: "var(--text-muted)" }}>📌 {l}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Features */}
            {b.features.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>ویژگی‌ها</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {b.features.map(f => (
                    <span key={f} style={{ background: "rgba(59,123,245,0.08)", border: "1px solid rgba(59,123,245,0.22)", borderRadius: 20, padding: "3px 12px", fontSize: "0.75rem", color: "var(--accent)" }}>✓ {f}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Pricing */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>قیمت‌گذاری</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["هفتگی", b.priceWeekly + "M", "—"],
                  ["ماهانه", b.price + "M", ""],
                  ["سه‌ماهه (۱۰٪ تخفیف)", b.priceQuarterly + "M", "var(--accent-warm)"],
                  ["سالانه (۲۰٪ تخفیف)", b.priceYearly + "M", "var(--green)"],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ background: "var(--bg-surface)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 3 }}>{l}</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: c || "var(--accent-warm)" }}>{v} <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 400 }}>تومان</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ border: "1px solid var(--border)", background: "none", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.82rem", padding: "8px 16px", borderRadius: 8, cursor: "pointer", flex: 1 }}>بستن</button>
            <button onClick={onCompare} style={{ border: `1px solid ${isCompared ? "var(--accent-warm)" : "var(--border)"}`, background: isCompared ? "rgba(255,179,0,0.1)" : "none", color: isCompared ? "var(--accent-warm)" : "var(--text-main)", fontFamily: "inherit", fontSize: "0.82rem", padding: "8px 16px", borderRadius: 8, cursor: "pointer", flex: 1 }}>
              {isCompared ? "✓ در مقایسه" : "⚖ مقایسه"}
            </button>
            <button onClick={onBook} disabled={b.status !== "available"} style={{ background: b.status === "available" ? "var(--accent)" : "var(--border)", border: "none", color: b.status === "available" ? "#fff" : "var(--text-muted)", fontFamily: "inherit", fontSize: "0.85rem", fontWeight: 700, padding: "8px 20px", borderRadius: 8, cursor: b.status === "available" ? "pointer" : "not-allowed", flex: 2, boxShadow: b.status === "available" ? "0 2px 12px rgba(59,123,245,0.28)" : "none" }}>
              {b.status === "available" ? "رزرو آنلاین 🔴" : "مشغول است"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}