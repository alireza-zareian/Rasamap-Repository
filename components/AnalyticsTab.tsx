"use client";
import { useEffect, useState } from "react";
import { PieChart, LayoutGrid, Building2, Wallet, Database, X } from "lucide-react";
import { typeLabels, statusLabels } from "@/lib/types";
import { faNum } from "@/lib/format";

interface AnalyticsData {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  topCities: { city: string; count: number }[];
  allCities: string[];
  price: { avg: number; min: number; max: number };
  priceBrackets: { label: string; count: number }[];
  coverage: { withImage: number; geocoded: number };
}

// Shared label maps, so a type or status never reads differently here than on
// a card or in the admin panel.
const TYPE_FA = typeLabels as Record<string, string>;
const STATUS_FA = statusLabels as Record<string, string>;

const STATUS_COLOR: Record<string, string> = {
  available: "var(--green)", busy: "var(--red, #ef4444)",
  reserved: "var(--accent-warm)", inactive: "var(--text-muted)",
};
const TYPE_COLORS = ["var(--accent)", "var(--accent-warm)", "var(--green)", "var(--purple, #8b5cf6)", "#06b6d4"];

function Bar({ label, value, max, color = "var(--accent)", suffix = "" }: {
  label: string; value: number; max: number; color?: string; suffix?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <div style={{ width: 100, fontSize: "0.73rem", color: "var(--text-muted)", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: "var(--bg-card)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
      </div>
      <div style={{ width: 44, fontSize: "0.73rem", fontWeight: 700, textAlign: "left", color: "var(--text-main)" }}>
        {value}{suffix}
      </div>
    </div>
  );
}

export default function AnalyticsTab() {
  const [city, setCity] = useState("");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No synchronous setLoading(true) here: `loading` starts true for the first
    // fetch, and on a city change the previous data stays visible until the new
    // response arrives (no flash to a spinner).
    let active = true;
    const url = city ? `/api/analytics?city=${encodeURIComponent(city)}` : "/api/analytics";
    fetch(url)
      .then(r => r.json())
      .then(d => { if (active) { setData(d); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [city]);

  if (loading || !data) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
        {loading ? "در حال بارگذاری..." : "خطا در دریافت اطلاعات"}
      </div>
    );
  }

  const available  = data.byStatus["available"]  ?? 0;
  const maxCityCount = Math.max(...data.topCities.map(c => c.count), 1);
  const maxTypeCount = Math.max(...Object.values(data.byType), 1);
  const maxBracket   = Math.max(...data.priceBrackets.map(b => b.count), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* City filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", flexShrink: 0 }}>فیلتر شهر:</label>
        <select
          value={city}
          onChange={e => setCity(e.target.value)}
          style={{ flex: 1, background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", fontSize: "0.82rem", padding: "7px 10px", borderRadius: 8, outline: "none" }}
        >
          <option value="">همه شهرها</option>
          {data.allCities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {city && (
          <button onClick={() => setCity("")} style={{ fontSize: "0.75rem", padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <X size={12} /> همه
          </button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { num: faNum(data.total), label: "کل رسانه ثبت‌شده", color: "var(--accent)" },
          { num: `${available} / ${data.total}`, label: "خالی / کل", color: "var(--green)" },
          { num: `${faNum(data.price.avg)}M`, label: "میانگین قیمت (تومان/ماه)", color: "var(--accent-warm)" },
          { num: `${faNum(data.coverage.geocoded)}`, label: "رسانه با مختصات GPS", color: "#06b6d4" },
        ].map(k => (
          <div key={k.label} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px", textAlign: "center" }}>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: k.color }}>{k.num}</div>
            <div style={{ fontSize: "0.67rem", color: "var(--text-muted)", marginTop: 3, lineHeight: 1.4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px" }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}><PieChart size={14} /> وضعیت اشغال</div>
        {Object.entries(data.byStatus).map(([status, count]) => (
          <Bar key={status} label={STATUS_FA[status] ?? status} value={count} max={data.total} color={STATUS_COLOR[status] ?? "var(--accent)"} />
        ))}
      </div>

      {/* Type breakdown */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px" }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}><LayoutGrid size={14} /> توزیع نوع رسانه</div>
        {Object.entries(data.byType).map(([type, count], i) => (
          <Bar key={type} label={TYPE_FA[type] ?? type} value={count} max={maxTypeCount} color={TYPE_COLORS[i % TYPE_COLORS.length]} />
        ))}
      </div>

      {/* Top cities */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px" }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}><Building2 size={14} /> پرتراکم‌ترین شهرها</div>
        {data.topCities.map((c, i) => (
          <Bar key={c.city} label={c.city} value={c.count} max={maxCityCount} color={TYPE_COLORS[i % TYPE_COLORS.length]} />
        ))}
      </div>

      {/* Price brackets */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px" }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}><Wallet size={14} /> محدوده قیمتی</div>
        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 12 }}>
          کمینه {faNum(data.price.min)}M · بیشینه {faNum(data.price.max)}M · میانگین {faNum(data.price.avg)}M
        </div>
        {data.priceBrackets.map((b, i) => (
          <Bar key={b.label} label={b.label} value={b.count} max={maxBracket} color={TYPE_COLORS[i % TYPE_COLORS.length]} />
        ))}
      </div>

      {/* Data coverage */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px" }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}><Database size={14} /> پوشش داده</div>
        <Bar label="با تصویر" value={data.coverage.withImage} max={data.total} color="var(--accent-warm)" />
        <Bar label="با مختصات" value={data.coverage.geocoded}  max={data.total} color="#06b6d4" />
      </div>

    </div>
  );
}
