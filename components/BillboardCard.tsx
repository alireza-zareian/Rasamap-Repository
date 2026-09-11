"use client";
import { useState } from "react";
import MediaImage from "@/components/MediaImage";
import Link from "next/link";
import { CatalogueItem, typeLabels, statusLabels } from "@/lib/types";
import { Scale, Star, Sparkles } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { faNum, faCompact } from "@/lib/format";

interface BillboardCardProps {
  billboard: CatalogueItem;
  isCompared: boolean;
  onCompare: () => void;
  listMode?: boolean;
}

export default function BillboardCard({
  billboard: b, isCompared, onCompare, listMode = false,
}: BillboardCardProps) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const statusColor = b.status === "available" ? "var(--green-accent)" : b.status === "busy" ? "var(--red)" : "var(--accent-warm)";
  const statusLabel = `● ${statusLabels[b.status] ?? b.status}`;
  // Hover lift/shadow only — 2 renders per hover, nothing on mousemove.
  const [hovered, setHovered] = useState(false);
  const views = b.traffic?.estimatedViews ?? 0;

  // ── List mode: compact horizontal card ──────────────────────────
  if (listMode) {
    return (
      <div
        data-testid="billboard-card"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          margin: "6px 0",
          borderRadius: 10,
          background: "var(--bg-surface)",
          border: `1px solid ${isCompared ? "var(--accent-warm)" : hovered ? "var(--border-hi)" : "var(--border)"}`,
          cursor: "default",
          transition: "border-color 0.18s ease, box-shadow 0.18s ease",
          overflow: "hidden",
          display: "flex",
          boxShadow: hovered ? "0 6px 20px rgba(0,0,0,0.28)" : "none",
        }}>
        {/* Square thumb */}
        <div style={{ width: 88, height: 88, flexShrink: 0, position: "relative", background: "var(--bg-card)", overflow: "hidden" }}>
          {/* 88 CSS pixels, so `sizes` lets the loader hand over the 256-wide
              variant instead of the 500-wide source — enough even at 2x. */}
          <MediaImage src={b.images?.[0]} alt={b.name} type={b.type} sizes="88px" iconSize={26} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, lineHeight: 1.35 }}>{b.name}</div>
            <span style={{ fontSize: "0.68rem", color: statusColor, fontWeight: 600, whiteSpace: "nowrap", marginRight: 8 }}>{statusLabel}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              {views > 0 && (
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>~{faCompact(views)} نفر/روز ·</span>
              )}
              <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--accent-warm)" }}>{faNum(b.price)}M</span>
              <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>ت/ماه</span>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={e => { e.stopPropagation(); onCompare(); }} className="card-action-btn" style={{
                ...smallBtnStyle,
                background: isCompared ? "var(--accent-warm)" : "var(--bg-card)",
                border: `1px solid ${isCompared ? "var(--accent-warm)" : "var(--border)"}`,
                color: isCompared ? "#111" : "var(--text-muted)",
                display: "flex", alignItems: "center", gap: 4,
              }}><Scale size={12} /> مقایسه</button>
              <Link href={`/billboard/${b.slug}`} onClick={e => e.stopPropagation()} className="card-action-btn" style={{ ...smallBtnStyle, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                مشخصات
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Grid mode: full card ─────────────────────────────────────────
  return (
    <div
      data-testid="billboard-card"
      className={b.featured ? "gradient-frame" : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: 12,
        background: "var(--bg-surface)",
        border: `1px solid ${isCompared ? "var(--accent-warm)" : hovered ? "var(--border-hi)" : "var(--border)"}`,
        cursor: "default",
        transition: "border-color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hovered ? "0 12px 32px rgba(0,0,0,0.38), 0 4px 18px var(--accent-glow)" : "none",
        overflow: "hidden",
      }}>
      {/* Square image area */}
      <div style={{
        position: "relative",
        aspectRatio: "1 / 1",
        background: "var(--bg-card)",
        overflow: "hidden",
      }}>
        {/* The photo drifts in on hover while the badges stay put — so the
            wrapper moves, not the whole square. MediaImage fills its parent,
            and so does the placeholder, so both zoom the same way.
            `.card-photo-zoom` carries the transition, which lets
            prefers-reduced-motion switch it off (globals.css). */}
        <div className="card-photo-zoom" style={{
          position: "absolute", inset: 0,
          transform: hovered ? "scale(1.03)" : "scale(1)",
        }}>
          {/* A grid card is 320–400 CSS px wide, so at 1x the 384 variant fits
              and at 2x the 500-wide source is the largest that exists. */}
          <MediaImage src={b.images?.[0]} alt={b.name} type={b.type}
            sizes="(max-width: 700px) 100vw, 384px" />
        </div>

        {/* Type badge */}
        <div style={{ position: "absolute", top: 8, right: 8, background: dark ? "rgba(10,14,26,0.78)" : "rgba(255,255,255,0.82)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 9px", fontSize: "0.7rem", color: "var(--text-muted)", backdropFilter: "blur(4px)" }}>
          {typeLabels[b.type]}
        </div>
        {/* Status */}
        <div style={{ position: "absolute", top: 8, left: 8, background: `${statusColor}18`, border: `1px solid ${statusColor}44`, borderRadius: 6, padding: "2px 9px", fontSize: "0.7rem", color: statusColor, fontWeight: 600, backdropFilter: "blur(4px)" }}>
          {statusLabel}
        </div>
        {/* Paid promotion — the only thing `featured` buys is this badge and a
            place at the top of the results. */}
        {b.featured && (
          <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(245,158,11,0.92)", borderRadius: 6, padding: "2px 8px", fontSize: "0.68rem", color: "#1a1206", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
            <Sparkles size={11} /> ویژه
          </div>
        )}
        {/* Rating — only shown once the media actually has reviews, so a card
            never displays a score nobody gave. */}
        {b.reviewCount > 0 && (
          <div style={{ position: "absolute", bottom: 8, right: 8, background: dark ? "rgba(10,14,26,0.78)" : "rgba(255,255,255,0.82)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 8px", fontSize: "0.68rem", color: "var(--accent-warm)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", gap: 4 }}>
            <Star size={11} fill="currentColor" /> {b.rating} ({b.reviewCount})
          </div>
        )}
      </div>

      {/* Compact card body */}
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ fontSize: "0.87rem", fontWeight: 600, lineHeight: 1.35, marginBottom: 8 }}>{b.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
            {views > 0 && (
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>~{faCompact(views)} نفر/روز ·</span>
            )}
            <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--accent-warm)", whiteSpace: "nowrap" }}>{faNum(b.price)}M</span>
            <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>ت/ماه</span>
          </div>
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            <button onClick={e => { e.stopPropagation(); onCompare(); }} className="card-action-btn" style={{
              background: isCompared ? "var(--accent-warm)" : "var(--bg-card)",
              border: `1px solid ${isCompared ? "var(--accent-warm)" : "var(--border)"}`,
              color: isCompared ? "#111" : "var(--text-muted)",
              fontFamily: "inherit", fontSize: "0.72rem", fontWeight: 600,
              padding: "6px 9px", borderRadius: 7, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 3,
            }}>
              <Scale size={12} /> مقایسه
            </button>
            <Link href={`/billboard/${b.slug}`} onClick={e => e.stopPropagation()} className="card-action-btn" style={{
              background: "var(--accent)", border: "none",
              color: "#fff",
              fontFamily: "inherit", fontSize: "0.72rem", fontWeight: 700,
              padding: "6px 12px", borderRadius: 7, cursor: "pointer",
              textDecoration: "none", display: "flex", alignItems: "center",
            }}>
              مشخصات
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const smallBtnStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
  fontFamily: "inherit",
  fontSize: "0.72rem",
  padding: "4px 10px",
  borderRadius: 6,
  cursor: "pointer",
};
