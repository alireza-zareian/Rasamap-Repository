import { faNum } from "@/lib/format";
import { cssVar } from "@/components/ui/css-var";
import styles from "./admin.module.css";

/** A state in its colour; the tint is mixed from `tone` in CSS, which works for variables too. */
export function Badge({ text, tone }: { text: string; tone: string }) {
  return <span className={styles.badge} style={cssVar("--tone", tone)}>{text}</span>;
}

export function StatCard({ icon, label, value, tone, sub }: { icon: React.ReactNode; label: string; value: string; tone: string; sub?: string }) {
  return (
    <div className={styles.stat} style={cssVar("--tone", tone)}>
      <div className={styles.statHead}>{icon}<span>{label}</span></div>
      <div className={styles.statValue}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

export function BarRow({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  return (
    <div className={styles.bar} style={cssVar("--tone", tone)}>
      <div className={styles.barHead}><span>{label}</span><b>{faNum(value)}</b></div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/** The card a panel section's content sits in. */
export function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className={styles.section}>{children}</div>;
}
