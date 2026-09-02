"use client";
import { useState } from "react";
import Link from "next/link";
import { Billboard, typeLabels, statusLabels } from "@/lib/types";
import { Scale, Megaphone, Monitor, Milestone, Train, Bus, Star, Sparkles } from "lucide-react";
import { useTheme } from "@/lib/theme";

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

function NoImagePlaceholder({ type }: { type: string }) {
  const t = TYPE_THEMES[type] ?? DEFAULT_THEME;
  const Icon = TYPE_ICONS[type] ?? Megaphone;
  return (
    <div style={{ position: "absolute", inset: 0, background: t.grad, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.07 }} aria-hidden="true">
        <defs>
          <pattern id={`p-${type}`} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="18" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#p-${type})`} />
      </svg>
      <div style={{ position: "relative", width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: -8, borderRadius: "50%", background: t.ring, boxShadow: `0 0 24px 6px ${t.ring}` }} />
        <span style={{ position: "relative", filter: `drop-shadow(0 0 12px ${t.glow})` }}>
          <Icon size={34} color="rgba(255,255,255,0.92)" />
        </span>
      </div>
    </div>
  );
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

interface BillboardCardProps {
  billboard: Billboard;
  isSelected: boolean;
  isCompared: boolean;
  onCompare: () => void;
  listMode?: boolean;
}

export default function BillboardCard({
  billboard: b, isSelected, isCompared, onCompare, listMode = false,
}: BillboardCardProps) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const statusColor = b.status === "available" ? "var(--green-accent)" : b.status === "busy" ? "var(--red)" : "var(--accent-warm)";
  const statusLabel = `● ${statusLabels[b.status] ?? b.status}`;
  const [imgError, setImgError] = useState(false);
  const showImage = !!(b.images && b.images.length > 0) && !imgError;
  const views = b.traffic?.estimatedViews ?? 0;

  // ── List mode: compact horizontal card ──────────────────────────
  if (listMode) {
    return (
      <div style={{
        margin: "6px 0",
        borderRadius: 10,
        background: "var(--bg-surface)",
        border: `1px solid ${isSelected ? "var(--accent)" : isCompared ? "var(--accent-warm)" : "var(--border)"}`,
        cursor: "default",
        transition: "border-color 0.18s ease, box-shadow 0.18s ease",
        overflow: "hidden",
        display: "flex",
        boxShadow: isSelected ? "0 0 0 2px var(--accent)" : "none",
      }}>
        {/* Square thumb */}
        <div style={{ width: 88, height: 88, flexShrink: 0, position: "relative", background: "var(--bg-card)", overflow: "hidden" }}>
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.images[0]} alt={b.name} onError={() => setImgError(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <NoImagePlaceholder type={b.type} />
          )}
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
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>~{fmtViews(views)} نفر/روز ·</span>
              )}
              <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--accent-warm)" }}>{b.price}M</span>
              <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>ت/ماه</span>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={e => { e.stopPropagation(); onCompare(); }} style={{
                ...smallBtnStyle,
                background: isCompared ? "var(--accent-warm)" : "var(--bg-card)",
                border: `1px solid ${isCompared ? "var(--accent-warm)" : "var(--border)"}`,
                color: isCompared ? "#111" : "var(--text-muted)",
                display: "flex", alignItems: "center", gap: 4,
              }}><Scale size={12} /> مقایسه</button>
              <Link href={`/billboard/${b.slug}`} onClick={e => e.stopPropagation()} style={{ ...smallBtnStyle, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
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
    <div style={{
      borderRadius: 12,
      background: "var(--bg-surface)",
      border: `1px solid ${isSelected ? "var(--accent)" : isCompared ? "var(--accent-warm)" : "var(--border)"}`,
      cursor: "default",
      transition: "border-color 0.22s ease, box-shadow 0.22s ease",
      boxShadow: isSelected ? "0 0 0 2px var(--accent), 0 4px 24px var(--accent-glow)" : "none",
      overflow: "hidden",
    }}>
      {/* Square image area */}
      <div style={{
        position: "relative",
        aspectRatio: "1 / 1",
        background: "var(--bg-card)",
        overflow: "hidden",
      }}>
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.images[0]} alt={b.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setImgError(true)} />
        ) : (
          <NoImagePlaceholder type={b.type} />
        )}

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
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>~{fmtViews(views)} نفر/روز ·</span>
            )}
            <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--accent-warm)", whiteSpace: "nowrap" }}>{b.price}M</span>
            <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>ت/ماه</span>
          </div>
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            <button onClick={e => { e.stopPropagation(); onCompare(); }} style={{
              background: isCompared ? "var(--accent-warm)" : "var(--bg-card)",
              border: `1px solid ${isCompared ? "var(--accent-warm)" : "var(--border)"}`,
              color: isCompared ? "#111" : "var(--text-muted)",
              fontFamily: "inherit", fontSize: "0.72rem", fontWeight: 600,
              padding: "6px 9px", borderRadius: 7, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 3,
            }}>
              <Scale size={12} /> مقایسه
            </button>
            <Link href={`/billboard/${b.slug}`} onClick={e => e.stopPropagation()} style={{
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
