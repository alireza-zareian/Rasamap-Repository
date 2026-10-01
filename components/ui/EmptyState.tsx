import type { ReactNode } from "react";
import { cssVar } from "./css-var";
import styles from "./empty-state.module.css";

/**
 * A designed "nothing here yet" panel: what the list would hold and the one way
 * to fill it (§5). One component, because the saved list and the campaign plan
 * each drew their own copy and one of them lost its centred icon — the reset
 * makes an <svg> a block, and only one copy had wrapped it.
 */
export function EmptyState({
  icon, tone, title, children, action,
}: {
  icon: ReactNode;
  /** The icon's colour. */
  tone?: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.icon} style={tone ? cssVar("--tone", tone) : undefined}>{icon}</div>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.text}>{children}</p>
      {action}
    </div>
  );
}
