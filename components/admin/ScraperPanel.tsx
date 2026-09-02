"use client";
import type { AdminStats } from "@/lib/admin/types";
import { C } from "./constants";
import { Bot, Database, MapPin, ImageOff, Copy, PlayCircle } from "lucide-react";

/**
 * Read-only status of the data pipeline.
 *
 * The scraper is a set of Python scripts run by .github/workflows/scrape.yml on
 * a nightly cron; the Next.js app has no way to start one and does not pretend
 * to. Everything below is counted from the billboards table itself, so it
 * reflects what actually landed in the database after the last run.
 */
const SOURCE_LABEL: Record<string, string> = {
  billboardiha: "Billboardiha.com",
  aradholding:  "آراد هلدینگ",
  irbillboard:  "IRBillboard",
  listing:      "ثبت‌شده توسط کاربران",
  manual:       "ثبت دستی ادمین",
};

function Tile({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.muted, fontSize: "0.75rem", marginBottom: 8 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: C.text }}>{value}</div>
      {hint && <div style={{ fontSize: "0.68rem", color: C.muted, marginTop: 4, lineHeight: 1.6 }}>{hint}</div>}
    </div>
  );
}

export function ScraperPanel({ stats }: { stats: AdminStats | null }) {
  const fa = (n: number) => n.toLocaleString("fa-IR");

  if (!stats) {
    return <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: "0.85rem" }}>در حال بارگذاری آمار...</div>;
  }

  const sources = Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]);
  const maxSource = Math.max(...sources.map(([, n]) => n), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.9rem", fontWeight: 700, marginBottom: 6 }}>
        <Bot size={16} /> وضعیت داده و اسکرپر
      </div>

      <div style={{ fontSize: "0.75rem", color: C.muted, lineHeight: 1.9, marginBottom: 18, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
        اسکرپر مجموعه‌ای از اسکریپت‌های پایتون در پوشهٔ <code style={{ fontFamily: "monospace", fontSize: "11px", background: "#0006", padding: "1px 5px", borderRadius: 4, color: "#38bdf8" }}>scraper/</code> است
        که هر شب ساعت ۴:۳۰ بامداد به وقت تهران توسط
        <code style={{ fontFamily: "monospace", fontSize: "11px", background: "#0006", padding: "1px 5px", borderRadius: 4, color: "#38bdf8", margin: "0 4px" }}>.github/workflows/scrape.yml</code>
        اجرا می‌شود و نتیجه را در مخزن کامیت می‌کند؛ سپس با
        <code style={{ fontFamily: "monospace", fontSize: "11px", background: "#0006", padding: "1px 5px", borderRadius: 4, color: "#38bdf8", margin: "0 4px" }}>npm run db:seed</code>
        وارد دیتابیس می‌شود. این پنل فقط گزارش می‌دهد و امکان اجرای اسکرپر از داخل برنامه وجود ندارد —
        اجرای دستی از صفحهٔ Actions در گیت‌هاب انجام می‌شود.
      </div>

      {/* Live counters, all read from the billboards table */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Tile icon={<Database size={13} />} label="کل رکوردها" value={fa(stats.total)} />
        <Tile icon={<Bot size={13} />} label="ایمپورت ۷ روز اخیر" value={fa(stats.recentlyImported)} hint="بر اساس فیلد scrapedAt" />
        <Tile icon={<MapPin size={13} />} label="بدون مختصات" value={fa(stats.missingCoords)} hint={`${fa(stats.withCoords)} رکورد جئوکد شده`} />
        <Tile icon={<ImageOff size={13} />} label="بدون تصویر" value={fa(stats.missingImages)} />
        <Tile icon={<Copy size={13} />} label="خوشهٔ مختصات تکراری" value={fa(stats.duplicateGroups)} hint="سلول‌های ۵۰ متری با بیش از یک رکورد" />
      </div>

      {/* Per-source breakdown */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: 14 }}>منبع رکوردها</div>
        {sources.map(([src, count]) => (
          <div key={src} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
            <div style={{ width: 150, fontSize: "0.75rem", color: C.muted, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {SOURCE_LABEL[src] ?? src}
            </div>
            <div style={{ flex: 1, height: 8, background: C.card, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${(count / maxSource) * 100}%`, height: "100%", background: C.accent, borderRadius: 4 }} />
            </div>
            <div style={{ width: 60, fontSize: "0.75rem", fontWeight: 700, textAlign: "left" }}>{fa(count)}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, fontSize: "0.72rem", color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
        <PlayCircle size={13} /> اجرای دستی: مخزن ← Actions ← «Auto-scrape billboards» ← Run workflow
      </div>
    </div>
  );
}
