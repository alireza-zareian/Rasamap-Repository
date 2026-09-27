"use client";
import { useEffect, useRef, useState } from "react";
import { PieChart, LayoutGrid, Building2, Wallet, Database, X } from "lucide-react";
import { typeLabels, availabilityLabels } from "@/lib/types";
import { faNum } from "@/lib/format";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import { availabilityTone } from "@/components/ui/availability";
import { Button } from "@/components/ui/Button";
import { cssVar } from "@/components/ui/css-var";
import form from "@/components/ui/form.module.css";
import styles from "./AnalyticsTab.module.css";

interface AnalyticsData {
  total: number;
  byType: Record<string, number>;
  byAvailability: Record<string, number>;
  topCities: { city: string; count: number }[];
  allCities: string[];
  price: { avg: number; min: number; max: number };
  priceBrackets: { label: string; count: number }[];
  coverage: { withImage: number; geocoded: number };
}

// Shared label maps, so a type or status never reads differently here than on
// a card or in the admin panel.
const TYPE_FA = typeLabels as Record<string, string>;
const STATUS_FA = availabilityLabels;

const TYPE_COLORS = ["var(--accent)", "var(--accent-warm)", "var(--green)", "var(--purple, #8b5cf6)", "#06b6d4"];

function Bar({ label, value, max, color = "var(--accent)" }: {
  label: string; value: number; max: number; color?: string;
}) {
  return (
    <div className={styles.bar} style={cssVar("--tone", color)}>
      <div className={styles.barLabel}>{label}</div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
      <div className={styles.barValue}>{faNum(value)}</div>
    </div>
  );
}

export type { AnalyticsData };

/**
 * The market figures, for the whole country or one city. The page renders the
 * country-wide view on the server and hands it in as `initial`; only choosing a
 * city asks the API again.
 */
export default function AnalyticsTab({ initial }: { initial: AnalyticsData }) {
  const [city, setCity] = useState("");
  const [data, setData] = useState<AnalyticsData>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const firstRender = useRef(true);

  useEffect(() => {
    // The first render already has the country-wide figures from the server.
    if (firstRender.current) { firstRender.current = false; return; }
    // The figures on screen stay until the new ones arrive, and stay if the
    // request fails: the filter must remain on screen so the visitor can pick
    // another city or try again. It used to replace the whole tab with an
    // error line and no way back.
    let active = true;
    setPending(true);
    const url = city ? `/api/analytics?city=${encodeURIComponent(city)}` : "/api/analytics";
    fetchJson<AnalyticsData>(url)
      .then(d => { if (active) { setData(d); setError(""); } })
      .catch(err => { if (active) setError(errorMessage(err)); })
      .finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, [city, attempt]);

  const available  = data.byAvailability["available"]  ?? 0;
  const maxCityCount = Math.max(...data.topCities.map(c => c.count), 1);
  const maxTypeCount = Math.max(...Object.values(data.byType), 1);
  const maxBracket   = Math.max(...data.priceBrackets.map(b => b.count), 1);

  return (
    <div className={styles.tab} aria-busy={pending}>
      <div className={styles.filter}>
        <label htmlFor="analytics-city">فیلتر شهر:</label>
        <select id="analytics-city" className={form.input} value={city} onChange={e => setCity(e.target.value)}>
          <option value="">همه شهرها</option>
          {data.allCities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {city && <Button size="sm" intent="quiet" onClick={() => setCity("")}><X size={12} /> همه</Button>}
      </div>
      {pending && <div role="status" className={styles.pending}>در حال بارگذاری…</div>}
      {error && (
        <div role="alert" className={form.error}>
          <span>آمار {city || "کل کشور"} دریافت نشد: {error}</span>
          <Button size="sm" onClick={() => setAttempt(n => n + 1)}>تلاش دوباره</Button>
        </div>
      )}

      <div className={styles.kpis}>
        {[
          { num: faNum(data.total), label: "کل رسانه ثبت‌شده", color: "var(--accent)" },
          { num: `${faNum(available)} / ${faNum(data.total)}`, label: "خالی / کل", color: "var(--green)" },
          { num: `${faNum(data.price.avg)}M`, label: "میانگین قیمت (تومان/ماه)", color: "var(--accent-warm)" },
          { num: faNum(data.coverage.geocoded), label: "رسانه با مختصات GPS", color: "#06b6d4" },
        ].map(k => (
          <div key={k.label} className={styles.kpi} style={cssVar("--tone", k.color)}>
            <strong>{k.num}</strong>
            <span>{k.label}</span>
          </div>
        ))}
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}><PieChart size={14} /> وضعیت اشغال</h2>
        {Object.entries(data.byAvailability).map(([status, count]) => (
          <Bar key={status} label={STATUS_FA[status] ?? status} value={count} max={data.total} color={availabilityTone(status)} />
        ))}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}><LayoutGrid size={14} /> توزیع نوع رسانه</h2>
        {Object.entries(data.byType).map(([type, count], i) => (
          <Bar key={type} label={TYPE_FA[type] ?? type} value={count} max={maxTypeCount} color={TYPE_COLORS[i % TYPE_COLORS.length]} />
        ))}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}><Building2 size={14} /> پرتراکم‌ترین شهرها</h2>
        {data.topCities.map((c, i) => (
          <Bar key={c.city} label={c.city} value={c.count} max={maxCityCount} color={TYPE_COLORS[i % TYPE_COLORS.length]} />
        ))}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}><Wallet size={14} /> محدوده قیمتی</h2>
        <p className={styles.panelNote}>
          کمینه {faNum(data.price.min)}M · بیشینه {faNum(data.price.max)}M · میانگین {faNum(data.price.avg)}M
        </p>
        {data.priceBrackets.map((b, i) => (
          <Bar key={b.label} label={b.label} value={b.count} max={maxBracket} color={TYPE_COLORS[i % TYPE_COLORS.length]} />
        ))}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}><Database size={14} /> پوشش داده</h2>
        <Bar label="با تصویر" value={data.coverage.withImage} max={data.total} color="var(--accent-warm)" />
        <Bar label="با مختصات" value={data.coverage.geocoded}  max={data.total} color="#06b6d4" />
      </section>
    </div>
  );
}
