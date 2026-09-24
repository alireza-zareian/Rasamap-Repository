import { ClipboardList, CheckCircle2, MapPin, AlertTriangle, ImageOff, Sparkles, Copy } from "lucide-react";
import { getAdminStats } from "@/lib/db/stats";
import { faNum } from "@/lib/format";
import { C, TYPE_LABEL } from "@/components/admin/constants";
import { StatCard, BarRow } from "@/components/admin/Badge";

/** The panel's front page: the dashboard counters, read on the server. */
export default async function AdminOverview() {
  const stats = await getAdminStats();

  return (
    <div>
      <div style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: 6 }}>نمای کلی داشبورد</div>
      <div style={{ fontSize: "0.78rem", color: C.muted, marginBottom: 24 }}>آخرین وضعیت سیستم</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard icon={<ClipboardList size={20} />} label="کل بیلبوردها" value={faNum(stats.total)} color={C.accent} />
        <StatCard icon={<CheckCircle2 size={20} />} label="فعال" value={faNum(stats.active)} color={C.green} />
        <StatCard icon={<MapPin size={20} />} label="دارای مختصات" value={faNum(stats.withCoords)} color={C.green} sub={`${faNum(Math.round((stats.withCoords / stats.total) * 100))}%`} />
        <StatCard icon={<AlertTriangle size={20} />} label="بدون مختصات" value={faNum(stats.missingCoords)} color="#f59e0b" />
        <StatCard icon={<ImageOff size={20} />} label="بدون تصویر" value={faNum(stats.missingImages)} color="#f59e0b" />
        <StatCard icon={<Sparkles size={20} />} label="هفته اخیر" value={faNum(stats.recentlyImported)} color="#8b5cf6" />
        <StatCard icon={<Copy size={20} />} label="خوشه هم‌مکان (~۵۰م)" value={faNum(stats.duplicateGroups)} color="#ef4444" sub="نقاطی با ۲+ رسانه نزدیک هم" />
      </div>
      <div className="admin-3col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {([["منابع داده", stats.bySource, C.accent], ["نوع رسانه", stats.byType, "#8b5cf6"], ["شهرها (برتر)", stats.byCity, C.green]] as const).map(([title, data, color]) => {
          const entries = Object.entries(data).sort(([, a], [, b]) => b - a).slice(0, 8);
          const max = Math.max(...Object.values(data));
          return (
            <div key={title} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: 14 }}>{title}</div>
              {entries.map(([k, v]) => <BarRow key={k} label={title === "نوع رسانه" ? (TYPE_LABEL[k] ?? k) : k} value={v} max={max} color={color} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
