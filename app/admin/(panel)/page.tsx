import { ClipboardList, CheckCircle2, MapPin, AlertTriangle, ImageOff, Sparkles, Copy } from "lucide-react";
import { getAdminStats } from "@/lib/db/stats";
import { faNum } from "@/lib/format";
import { sourceLabel } from "@/lib/types";
import { TYPE_LABEL } from "@/components/admin/constants";
import { StatCard, BarRow } from "@/components/admin/Badge";
import styles from "./overview.module.css";

/** Each breakdown's rows are keys; these turn a key into what a person reads. */
const typeName = (k: string) => TYPE_LABEL[k] ?? k;
const cityName = (k: string) => k;

/** The panel's front page: the dashboard counters, read on the server. */
export default async function AdminOverview() {
  const stats = await getAdminStats();
  const share = stats.total > 0 ? Math.round((stats.withCoords / stats.total) * 100) : 0;

  return (
    <div>
      <h1 className={styles.title}>نمای کلی داشبورد</h1>
      <p className={styles.lede}>آخرین وضعیت سیستم</p>
      <div className={styles.stats}>
        <StatCard icon={<ClipboardList size={20} />} label="کل بیلبوردها" value={faNum(stats.total)} tone="var(--accent)" />
        <StatCard icon={<CheckCircle2 size={20} />} label="فعال" value={faNum(stats.active)} tone="var(--green)" />
        <StatCard icon={<MapPin size={20} />} label="دارای مختصات" value={faNum(stats.withCoords)} tone="var(--green)" sub={`${faNum(share)}٪`} />
        <StatCard icon={<AlertTriangle size={20} />} label="بدون مختصات" value={faNum(stats.missingCoords)} tone="#f59e0b" />
        <StatCard icon={<ImageOff size={20} />} label="بدون تصویر" value={faNum(stats.missingImages)} tone="#f59e0b" />
        <StatCard icon={<Sparkles size={20} />} label="هفته اخیر" value={faNum(stats.recentlyImported)} tone="#8b5cf6" />
        <StatCard icon={<Copy size={20} />} label="خوشه هم‌مکان (~۵۰م)" value={faNum(stats.duplicateGroups)} tone="var(--red)" sub="نقاطی با ۲+ رسانه نزدیک هم" />
      </div>
      <div className={styles.columns}>
        {([
          ["منابع داده", stats.bySource, "var(--accent)", sourceLabel],
          ["نوع رسانه", stats.byType, "#8b5cf6", typeName],
          ["شهرها (برتر)", stats.byCity, "var(--green)", cityName],
        ] as const).map(([title, data, tone, name]) => {
          const entries = Object.entries(data).sort(([, a], [, b]) => b - a).slice(0, 8);
          const max = Math.max(0, ...Object.values(data));
          return (
            <section key={title} className={styles.column}>
              <h2>{title}</h2>
              {entries.map(([k, v]) => <BarRow key={k} label={name(k)} value={v} max={max} tone={tone} />)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
