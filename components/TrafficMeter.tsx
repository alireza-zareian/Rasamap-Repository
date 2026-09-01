"use client";
import { BarChart2, Car, Footprints, Clock, Info } from "lucide-react";
import { TrafficData } from "@/lib/types";

interface TrafficMeterProps {
  traffic: TrafficData;
  compact?: boolean;
}

export default function TrafficMeter({ traffic, compact = false }: TrafficMeterProps) {
  const score = traffic.viewabilityScore;
  const scoreColor = score >= 80 ? "var(--green)" : score >= 60 ? "var(--accent-warm)" : "var(--accent)";

  const formatNum = (n: number) =>
    n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n.toString();

  if (compact) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Circular score */}
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: `conic-gradient(${scoreColor} ${score * 3.6}deg, var(--bg-card) 0deg)`,
          display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: "var(--bg-surface)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.65rem", fontWeight: 700, color: scoreColor,
          }}>{score}</div>
        </div>
        <div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>دیده می‌شوید توسط</div>
          <div style={{ fontSize: "0.88rem", fontWeight: 700, color: scoreColor }}>
            ~{formatNum(traffic.estimatedViews)} نفر/روز
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "14px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><BarChart2 size={15} style={{ color: "var(--accent)" }} />تخمین بازدید روزانه</div>
        <div style={{
          fontSize: "0.7rem", padding: "3px 10px", borderRadius: 20,
          background: score >= 80 ? "rgba(34,197,94,0.12)" : "rgba(255,179,0,0.12)",
          color: scoreColor, border: `1px solid ${scoreColor}44`,
        }}>
          امتیاز دیده‌شدن: {score}/100
        </div>
      </div>

      {/* Main visual */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        {/* Big gauge */}
        <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
          <svg viewBox="0 0 80 80" style={{ width: 80, height: 80, transform: "rotate(-90deg)" }}>
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--bg-card)" strokeWidth="10" />
            <circle cx="40" cy="40" r="32" fill="none" stroke={scoreColor} strokeWidth="10"
              strokeDasharray={`${score * 2.01} 201`} strokeLinecap="round"
              style={{ transition: "stroke-dasharray 1s ease" }} />
          </svg>
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            fontSize: "1.1rem", fontWeight: 800, color: scoreColor,
          }}>{score}<div style={{ fontSize: "0.55rem", color: "var(--text-muted)", fontWeight: 400 }}>امتیاز</div></div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, color: scoreColor }}>
            ~{formatNum(traffic.estimatedViews)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 6 }}>بازدید تخمینی روزانه</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.72rem", color: "var(--text-muted)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Car size={12} />{formatNum(traffic.daily)} وسیله نقلیه در روز</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Footprints size={12} />{formatNum(traffic.pedestrian)} عابر پیاده در روز</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Clock size={12} />اوج ترافیک: {traffic.peakHour}</div>
          </div>
        </div>
      </div>

      {/* Traffic bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 5 }}>
          <span>سطح ترافیک</span>
          <span style={{ color: traffic.congestionLevel >= 8 ? "var(--accent)" : "var(--text-muted)" }}>
            {traffic.congestionLevel}/10
          </span>
        </div>
        <div style={{ height: 8, background: "var(--bg-card)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 4, width: `${traffic.congestionLevel * 10}%`,
            background: traffic.congestionLevel >= 8
              ? "linear-gradient(90deg, var(--accent-warm), var(--accent))"
              : "var(--accent-warm)",
            transition: "width 1s",
          }} />
        </div>
      </div>

      {/* Methodology note */}
      <div style={{
        fontSize: "0.66rem", color: "var(--text-muted)", paddingTop: 8,
        borderTop: "1px solid var(--border)", lineHeight: 1.5,
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Info size={11} />محاسبه بر اساس: تعداد وسایل نقلیه × ۱.۴ سرنشین × ۴۰٪ نرخ توجه + عابرین × ۶۰٪</span>
      </div>
    </div>
  );
}
