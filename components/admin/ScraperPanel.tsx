import type { AdminStats } from "@/lib/admin/types";
import { Bot, Database, MapPin, Images, Copy, FileCode2, GitCommitHorizontal, Server, Workflow, CalendarClock, Info } from "lucide-react";
import { sourceLabel } from "@/lib/types";
import { faNum } from "@/lib/format";
import { cssVar } from "@/components/ui/css-var";
import styles from "./admin.module.css";
import own from "./ScraperPanel.module.css";

/**
 * The data pipeline's status, read-only. The crawler runs nightly from
 * .github/workflows/scrape.yml, not from here; every figure is counted from the
 * billboards table, so it shows what actually landed.
 */

// A fixed palette so a source keeps the same colour between renders.
const SOURCE_COLORS = ["var(--accent)", "#8b5cf6", "var(--green)", "#f59e0b", "#38bdf8", "#ec4899", "#94a3b8"];

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/** One figure, with a progress bar when it is a share. */
function Metric({ icon, label, value, tone = "var(--text-main)", ratio, sub }: {
  icon: React.ReactNode; label: string; value: string; tone?: string; ratio?: number; sub?: string;
}) {
  return (
    <div className={own.metric} style={cssVar("--tone", tone)}>
      <div className={own.metricHead}><span className={own.chip}>{icon}</span>{label}</div>
      <div className={own.value}>{value}</div>
      {ratio != null && <div className={own.meter}><div style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} /></div>}
      {sub && <div className={own.sub}>{sub}</div>}
    </div>
  );
}

/** One box in the "how the data gets here" flow. */
function Step({ n, icon, title, note }: { n: number; icon: React.ReactNode; title: string; note: string }) {
  return (
    <li className={own.step}>
      <div className={own.stepHead}><span className={own.stepNumber}>{faNum(n)}</span>{icon}</div>
      <strong>{title}</strong>
      <p>{note}</p>
    </li>
  );
}

export function ScraperPanel({ stats }: { stats: AdminStats }) {
  const sources = Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]);
  const sourceTotal = sources.reduce((s, [, n]) => s + n, 0) || 1;
  const colorFor = (i: number) => SOURCE_COLORS[i % SOURCE_COLORS.length];
  const withImages = stats.total - stats.missingImages;
  const coordShare = pct(stats.withCoords, stats.total);
  const imageShare = pct(withImages, stats.total);

  return (
    <div className={own.panel}>
      <div className={styles.head}>
        <h1 className={styles.title}><Bot size={17} /> وضعیت داده و اسکرپر</h1>
        <span className={own.readOnly}>فقط گزارش — بدون اجرا</span>
      </div>

      <section>
        <h2 className={own.subTitle}>داده چطور به اینجا می‌رسد</h2>
        <ol className={own.steps}>
          <Step n={1} icon={<FileCode2 size={14} />} title="اسکریپت‌های پایتون" note="پوشهٔ scraper/ — هر شب ۴:۳۰ بامداد به وقت تهران" />
          <Step n={2} icon={<GitCommitHorizontal size={14} />} title="کامیت در مخزن" note="workflow به نام scrape.yml داده و تصویرها را کامیت می‌کند" />
          <Step n={3} icon={<Database size={14} />} title="ادغام در دیتابیس" note="دستور npm run db:sync-scraped ردیف‌های تازه را ادغام می‌کند و ویرایش‌های مدیر را دست نمی‌زند" />
          <Step n={4} icon={<Server size={14} />} title="نمایش در سایت" note="همین ارقامی که پایین می‌بینید از جدول بیلبوردها خوانده شده" />
        </ol>
      </section>

      <div className={own.metrics}>
        <Metric icon={<Database size={15} />} label="کل رکوردها" value={faNum(stats.total)} tone="var(--accent)" />
        <Metric icon={<CalendarClock size={15} />} label="ایمپورت ۷ روز اخیر" value={faNum(stats.recentlyImported)} tone="#8b5cf6" sub="رکوردهایی که فیلد scrapedAt آن‌ها تازه است" />
        <Metric
          icon={<MapPin size={15} />}
          label="جئوکد شده (دارای مختصات)"
          value={`${faNum(stats.withCoords)}  ·  ${faNum(coordShare)}٪`}
          tone={coordShare >= 80 ? "var(--green)" : "#f59e0b"}
          ratio={stats.withCoords / (stats.total || 1)}
          sub={`${faNum(stats.missingCoords)} رکورد هنوز مختصات ندارد`}
        />
        <Metric
          icon={<Images size={15} />}
          label="دارای تصویر"
          value={`${faNum(withImages)}  ·  ${faNum(imageShare)}٪`}
          tone={imageShare >= 80 ? "var(--green)" : "#f59e0b"}
          ratio={withImages / (stats.total || 1)}
          sub={`${faNum(stats.missingImages)} رکورد بدون هیچ تصویری`}
        />
        <Metric icon={<Copy size={15} />} label="خوشهٔ مختصات تکراری" value={faNum(stats.duplicateGroups)} tone="var(--red)" sub="سلول‌های ۵۰ متری که بیش از یک رکورد در آن‌هاست" />
      </div>

      <section className={own.sources}>
        <div className={own.sourcesHead}>
          <h2>منبع رکوردها</h2>
          <span>{faNum(sources.length)} منبع · مجموع {faNum(sourceTotal)} رکورد</span>
        </div>
        <div className={own.stack} aria-hidden>
          {sources.map(([src, count], i) => (
            <div key={src} title={`${sourceLabel(src)} — ${faNum(count)}`} style={{ ...cssVar("--tone", colorFor(i)), width: `${(count / sourceTotal) * 100}%` }} />
          ))}
        </div>
        <ul className={own.legend}>
          {sources.map(([src, count], i) => (
            <li key={src} className={own.legendRow} style={cssVar("--tone", colorFor(i))}>
              <span className={own.swatch} />
              <span className={own.sourceName}>{sourceLabel(src)}</span>
              <span className={own.track}><div style={{ width: `${(count / sourceTotal) * 100}%` }} /></span>
              <span className={own.pct}>{faNum(pct(count, sourceTotal))}٪</span>
              <span className={own.num}>{faNum(count)}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className={own.note}>
        <Info size={16} />
        <div>
          این پنل فقط گزارش می‌دهد؛ اجرای اسکرپر از داخل برنامه ممکن نیست.
          برای اجرای دستی خارج از زمان‌بندی شبانه: در گیت‌هاب به مسیر
          <span className={own.path}><Workflow size={12} /> Actions → Auto-scrape billboards → Run workflow</span>
          بروید. نتیجه با کامیت بعدی و اجرای db:sync-scraped وارد سایت می‌شود.
        </div>
      </div>
    </div>
  );
}
