"use client";
import { Scale, X } from "lucide-react";
import { useModalA11y } from "@/lib/client/use-modal-a11y";
import type { CatalogueItem } from "@/lib/types";
import CompareTable from "@/components/compare/CompareTable";
import styles from "@/components/compare/compare.module.css";

/** The comparison table over the catalogue, opened from the compare bar. */
export default function CompareModal({ items, onClose }: { items: CatalogueItem[]; onClose: () => void }) {
  const boxRef = useModalA11y<HTMLDivElement>(onClose);
  const [a, b] = items;
  if (!a || !b) return null;
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="compare-title" tabIndex={-1} className={styles.box} onClick={e => e.stopPropagation()}>
        <div className={styles.boxHead}>
          <h2 id="compare-title" className={styles.boxTitle}><Scale size={18} /> مقایسهٔ رسانه‌ها</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="بستن مقایسه"><X size={18} /></button>
        </div>
        <div className={styles.boxBody}><CompareTable items={[a, b]} onLeave={onClose} /></div>
      </div>
    </div>
  );
}
