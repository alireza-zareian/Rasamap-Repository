"use client";
import { Scale, X, ArrowLeft } from "lucide-react";
import type { CatalogueItem } from "@/lib/types";
import { TypeIcon } from "@/components/TypeIcon";
import { Button } from "@/components/ui/Button";
import { MAX_COMPARE } from "@/lib/client/use-compare-list";
import styles from "@/components/compare/compare.module.css";

/** The strip that collects the media ticked for comparison, fixed to the bottom. */
export default function CompareBar({ items, onRemove, onCompare, onClear }: {
  items: CatalogueItem[];
  onRemove: (id: number) => void;
  onCompare: () => void;
  onClear: () => void;
}) {
  if (items.length === 0) return null;
  const slots = Array.from({ length: MAX_COMPARE }, (_, i) => items[i] ?? null);

  return (
    <div className={styles.bar}>
      <div className={styles.barTitle}><Scale size={15} /> مقایسه</div>
      <div className={styles.slots}>
        {slots.map((b, i) => b ? (
          <div key={b.id} className={styles.slot}>
            <TypeIcon type={b.type} size={14} />
            <span>{b.name}</span>
            <button type="button" className={styles.close} onClick={() => onRemove(b.id)} aria-label={`حذف ${b.name} از مقایسه`}><X size={13} /></button>
          </div>
        ) : (
          <div key={i} className={`${styles.slot} ${styles.emptySlot}`}>+ رسانهٔ {i === 0 ? "اول" : "دوم"}</div>
        ))}
      </div>
      <div className={styles.barActions}>
        <Button size="sm" intent="quiet" onClick={onClear}>پاک</Button>
        <Button size="sm" className={styles.go} onClick={onCompare} disabled={items.length < MAX_COMPARE}>
          {items.length < MAX_COMPARE ? "۱ رسانهٔ دیگر" : <>مقایسه کن <ArrowLeft size={14} /></>}
        </Button>
      </div>
    </div>
  );
}
