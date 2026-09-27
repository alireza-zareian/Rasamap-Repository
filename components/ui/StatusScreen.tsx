import type { ReactNode } from "react";
import { cssVar } from "./css-var";
import styles from "./status.module.css";

/**
 * The page a visitor sees instead of the one they asked for: 403, 404, a
 * failed render. §5 asks for a calm Persian message and a short reference —
 * the internals go to the log, never here. `inline` is the smaller variant a
 * panel section shows while the panel around it keeps working.
 */
export function StatusScreen({
  icon, code, tone, title, children, reference, actions, inline = false,
}: {
  icon?: ReactNode;
  /** A big status number, such as ۴۰۴. */
  code?: string;
  /** The icon's colour. */
  tone?: string;
  title: string;
  children: ReactNode;
  /** The error digest Next.js attaches to a server failure — the same id the log carries. */
  reference?: string;
  actions: ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={inline ? styles.inline : styles.screen}>
      <div className={styles.body}>
        {icon && <div className={styles.icon} style={tone ? cssVar("--tone", tone) : undefined}>{icon}</div>}
        {code && <div className={styles.code}>{code}</div>}
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.text}>{children}</p>
        {reference && <p className={styles.reference}>کد پیگیری: <code>{reference}</code></p>}
        <div className={styles.actions}>{actions}</div>
      </div>
    </div>
  );
}
