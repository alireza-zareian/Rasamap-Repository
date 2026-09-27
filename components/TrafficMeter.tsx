import { BarChart2, Car, Footprints, Clock, Info } from "lucide-react";
import type { TrafficData } from "@/lib/types";
import { faCompact, faNum } from "@/lib/format";
import { cssVar } from "@/components/ui/css-var";
import styles from "./detail.module.css";

/** Circumference of the gauge's r=32 circle, for the dash that draws the score. */
const GAUGE_LENGTH = 2 * Math.PI * 32;

export default function TrafficMeter({ traffic }: { traffic: TrafficData }) {
  const score = traffic.viewabilityScore;
  const tone = cssVar("--tone", score >= 80 ? "var(--green)" : score >= 60 ? "var(--accent-warm)" : "var(--accent)");
  const congested = traffic.congestionLevel >= 8;

  return (
    <div className={styles.meter} style={tone}>
      <div className={styles.meterHead}>
        <div className={styles.meterTitle}><BarChart2 size={15} />تخمین بازدید روزانه</div>
        <div className={styles.score}>امتیاز دیده‌شدن: {faNum(score)}/۱۰۰</div>
      </div>

      <div className={styles.meterMain}>
        <div className={styles.gauge}>
          <svg viewBox="0 0 80 80" aria-hidden>
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--bg-card)" strokeWidth="10" />
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--tone)" strokeWidth="10"
              strokeDasharray={`${(score / 100) * GAUGE_LENGTH} ${GAUGE_LENGTH}`} strokeLinecap="round" />
          </svg>
          <div className={styles.gaugeValue}>{faNum(score)}<small>امتیاز</small></div>
        </div>

        <div className={styles.views}>
          <div className={styles.viewsValue}>~{faCompact(traffic.estimatedViews)}</div>
          <div className={styles.viewsLabel}>بازدید تخمینی روزانه</div>
          <ul className={styles.facts}>
            <li><Car size={12} />{faCompact(traffic.daily)} وسیله نقلیه در روز</li>
            <li><Footprints size={12} />{faCompact(traffic.pedestrian)} عابر پیاده در روز</li>
            <li><Clock size={12} />اوج ترافیک: {traffic.peakHour}</li>
          </ul>
        </div>
      </div>

      <div className={styles.congestion}>
        <div className={styles.congestionHead}>
          <span>سطح ترافیک</span>
          <span className={congested ? styles.congestionHigh : undefined}>{faNum(traffic.congestionLevel)}/۱۰</span>
        </div>
        <div className={styles.bar}>
          <div className={`${styles.barFill} ${congested ? styles.barHigh : ""}`} style={{ width: `${traffic.congestionLevel * 10}%` }} />
        </div>
      </div>

      <div className={styles.method}>
        <Info size={11} />محاسبه بر اساس: تعداد وسایل نقلیه × ۱.۴ سرنشین × ۴۰٪ نرخ توجه + عابرین × ۶۰٪
      </div>
    </div>
  );
}
