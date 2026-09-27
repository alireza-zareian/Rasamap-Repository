"use client";
import type { ReactNode } from "react";
import { useId } from "react";
import { X } from "lucide-react";
import { useModalA11y } from "@/lib/client/use-modal-a11y";
import styles from "./dialog.module.css";

export { styles as dialogStyles };

/**
 * A modal dialog. Escape, the close button and a click on the backdrop all
 * close it; focus moves in on open, stays inside, and returns to the opener on
 * close (useModalA11y). Every modal is built on this, so none of them can
 * forget one of those — the admin confirm dialogs had forgotten all three.
 */
export function Dialog({
  title, icon, onClose, size = "md", footer, children,
}: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg";
  /** The action buttons, laid out as one row of equal widths. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const boxRef = useModalA11y<HTMLDivElement>(onClose);
  const titleId = useId();
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`${styles.box} ${styles[size]}`} onClick={e => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>{icon}{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="بستن"><X size={18} /></button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.foot}>{footer}</div>}
      </div>
    </div>
  );
}
