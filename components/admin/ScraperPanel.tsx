"use client";
import type { AdminStats } from "@/lib/admin/types";
import { C } from "./constants";
import { Bot, Database, MapPin, Images, Copy, FileCode2, GitCommitHorizontal, Server, Workflow, CalendarClock, Info } from "lucide-react";
import { faNum } from "@/lib/format";

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
  irbillboard:  "IRBillboard.com",
  listing:      "ثبت‌شده توسط کاربران",
  manual:       "ثبت دستی ادمین",
};

// Hex twins of the CSS custom properties, so the `${color}22` alpha-suffix
// idiom used across the admin panels works on every tone here.
const BLUE = "#3B7BF5", PURPLE = "#8b5cf6", GREEN = "#22C55E", AMBER = "#f59e0b", RED = "#ef4444";

// A fixed palette so a source keeps the same colour between renders.
const SOURCE_COLORS = [BLUE, PURPLE, GREEN, AMBER, "#38bdf8", "#ec4899", "#94a3b8"];

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/** One health metric: big number, coloured icon chip, and — when a ratio makes
 *  sense — a slim progress bar underneath. */
function Metric({
  icon, label, value, tone = C.text, ratio, sub,
}: {
  icon: React.ReactNode; label: string; value: string; tone?: string; ratio?: number; sub?: string;
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: `${tone}22`, color: tone, flexShrink: 0 }}>
          {icon}
        </span>
        <span style={{ fontSize: "0.74rem", color: C.muted, lineHeight: 1.5 }}>{label}</span>
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>{value}</div>
      {ratio != null && (
        <div style={{ height: 6, borderRadius: 4, background: C.card, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%`, height: "100%", background: tone, borderRadius: 4, transition: "width .5s ease" }} />
        </div>
      )}
      {sub && <div style={{ fontSize: "0.68rem", color: C.muted, lineHeight: 1.7 }}>{sub}</div>}
    </div>
  );
}

/** One box in the "how the data gets here" flow. */
function Step({ n, icon, title, note }: { n: number; icon: React.ReactNode; title: string; note: string }) {
  return (
    <div style={{ flex: "1 1 160px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 14px", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 999, background: C.accent, color: "#fff", fontSize: "0.66rem", fontWeight: 800, flexShrink: 0 }}>
          {faNum(n)}
        </span>
        <span style={{ color: C.muted, display: "flex" }}>{icon}</span>
      </div>
      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: C.text, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: "0.68rem", color: C.muted, lineHeight: 1.7 }}>{note}</div>
    </div>
  );
}

export function ScraperPanel({ stats }: { stats: AdminStats | null }) {
  if (!stats) {
    return <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: "0.85rem" }}>در حال بارگذاری آمار...</div>;
  }

  const sources = Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]);
  const sourceTotal = sources.reduce((s, [, n]) => s + n, 0) || 1;
  const colorFor = (i: number) => SOURCE_COLORS[i % SOURCE_COLORS.length];

  const withImages = stats.total - stats.missingImages;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* ── Title ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", fontWeight: 800 }}>
          <Bot size={17} /> وضعیت داده و اسکرپر
        </div>
        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: C.muted, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 12px" }}>
          فقط گزارش — بدون اجرا
        </span>
      </div>

      {/* ── How the data gets here ── */}
      <div>
        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: C.text, marginBottom: 10 }}>داده چطور به اینجا می‌رسد</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Step n={1} icon={<FileCode2 size={14} />}       title="اسکریپت‌های پایتون" note="پوشهٔ scraper/ — هر شب ۴:۳۰ بامداد به وقت تهران" />
          <Step n={2} icon={<GitCommitHorizontal size={14} />} title="کامیت در مخزن" note="workflow به نام scrape.yml داده و تصویرها را کامیت می‌کند" />
          <Step n={3} icon={<Database size={14} />}        title="ورود به دیتابیس" note="دستور npm run db:seed هنگام بیلد، رکوردها را وارد می‌کند" />
          <Step n={4} icon={<Server size={14} />}          title="نمایش در سایت" note="همین ارقامی که پایین می‌بینید از جدول بیلبوردها خوانده شده" />
        </div>
      </div>

      {/* ── Health metrics ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
        <Metric icon={<Database size={15} />} label="کل رکوردها" value={faNum(stats.total)} tone={BLUE} />
        <Metric icon={<CalendarClock size={15} />} label="ایمپورت ۷ روز اخیر" value={faNum(stats.recentlyImported)} tone={PURPLE} sub="رکوردهایی که فیلد scrapedAt آن‌ها تازه است" />
        <Metric
          icon={<MapPin size={15} />}
          label="جئوکد شده (دارای مختصات)"
          value={`${faNum(stats.withCoords)}  ·  ${faNum(pct(stats.withCoords, stats.total))}٪`}
          tone={pct(stats.withCoords, stats.total) >= 80 ? GREEN : AMBER}
          ratio={stats.withCoords / (stats.total || 1)}
          sub={`${faNum(stats.missingCoords)} رکورد هنوز مختصات ندارد`}
        />
        <Metric
          icon={<Images size={15} />}
          label="دارای تصویر"
          value={`${faNum(withImages)}  ·  ${faNum(pct(withImages, stats.total))}٪`}
          tone={pct(withImages, stats.total) >= 80 ? GREEN : AMBER}
          ratio={withImages / (stats.total || 1)}
          sub={`${faNum(stats.missingImages)} رکورد بدون هیچ تصویری`}
        />
        <Metric
          icon={<Copy size={15} />}
          label="خوشهٔ مختصات تکراری"
          value={faNum(stats.duplicateGroups)}
          tone={RED}
          sub="سلول‌های ۵۰ متری که بیش از یک رکورد در آن‌هاست"
        />
      </div>

      {/* ── Source breakdown ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>منبع رکوردها</div>
          <div style={{ fontSize: "0.7rem", color: C.muted }}>{faNum(sources.length)} منبع · مجموع {faNum(sourceTotal)} رکورد</div>
        </div>

        {/* Stacked composition bar */}
        <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: C.card, marginBottom: 16 }}>
          {sources.map(([src, count], i) => (
            <div
              key={src}
              title={`${SOURCE_LABEL[src] ?? src} — ${faNum(count)}`}
              style={{ width: `${(count / sourceTotal) * 100}%`, background: colorFor(i) }}
            />
          ))}
        </div>

        {/* Legend rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {sources.map(([src, count], i) => (
            <div key={src} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colorFor(i), flexShrink: 0 }} />
              <div style={{ width: 150, fontSize: "0.76rem", color: C.text, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {SOURCE_LABEL[src] ?? src}
              </div>
              <div style={{ flex: 1, height: 7, background: C.card, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${(count / sourceTotal) * 100}%`, height: "100%", background: colorFor(i), borderRadius: 4 }} />
              </div>
              <div style={{ width: 44, fontSize: "0.72rem", color: C.muted, textAlign: "left", flexShrink: 0 }}>{faNum(pct(count, sourceTotal))}٪</div>
              <div style={{ width: 52, fontSize: "0.78rem", fontWeight: 700, textAlign: "left", flexShrink: 0 }}>{faNum(count)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Manual run note ── */}
      <div style={{ display: "flex", gap: 11, alignItems: "flex-start", background: `${BLUE}12`, border: `1px solid ${BLUE}44`, borderRadius: 12, padding: "13px 15px" }}>
        <Info size={16} style={{ color: BLUE, flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: "0.74rem", color: C.muted, lineHeight: 1.9 }}>
          این پنل فقط گزارش می‌دهد؛ اجرای اسکرپر از داخل برنامه ممکن نیست.
          برای اجرای دستی خارج از زمان‌بندی شبانه: در گیت‌هاب به مسیر
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, margin: "0 5px", padding: "1px 8px", borderRadius: 6, background: C.card, color: C.text, fontWeight: 600 }}>
            <Workflow size={12} /> Actions ← «Auto-scrape billboards» ← Run workflow
          </span>
          بروید. نتیجه با کامیت بعدی و بیلد مجدد وارد سایت می‌شود.
        </div>
      </div>
    </div>
  );
}
