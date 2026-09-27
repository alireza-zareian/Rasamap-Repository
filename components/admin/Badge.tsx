import { faNum } from "@/lib/format";
import { cssVar } from "@/components/ui/css-var";
import styles from "./admin.module.css";

/**
 * A state in its colour. One `tone` — the tint is mixed from it in CSS. The
 * badge used to take a colour and a background built as `${color}18`, which is
 * not a colour at all when the colour is a variable, so every badge in
 * var(--accent) or var(--green) had no background.
 */
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
