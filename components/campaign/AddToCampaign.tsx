"use client";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import type { CatalogueItem } from "@/lib/types";
import { MAX_PICKED, useCampaign } from "@/lib/client/use-campaign";
import { faNum } from "@/lib/format";
import styles from "./add.module.css";

/**
 * Put this media item in the campaign, from its own page (§40). Once it is in,
 * the button says so and becomes the way to the plan; taking it out is done
 * there or in the tray, so a second tap here cannot drop it by accident.
 */
export default function AddToCampaign({ item, compact = false }: { item: CatalogueItem; compact?: boolean }) {
  const { items, setItems, ready } = useCampaign();
  const inPlan = items.some(p => p.id === item.id);
  const full = items.length >= MAX_PICKED;

  if (inPlan) {
    return (
      <Link href="/campaign" className={`${styles.add} ${styles.in} ${compact ? styles.compact : ""}`}>
        <Check size={14} /> {compact ? "در کمپین" : `در کمپین (${faNum(items.length)}) — مشاهدهٔ طرح`}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={`${styles.add} ${compact ? styles.compact : ""}`}
      disabled={!ready || full}
      title={full ? `یک کمپین حداکثر ${faNum(MAX_PICKED)} رسانه دارد` : undefined}
      onClick={() => setItems(prev => (prev.some(p => p.id === item.id) ? prev : [...prev, item].slice(0, MAX_PICKED)))}
    >
      <Plus size={14} /> {full ? "کمپین پر است" : "افزودن به کمپین"}
    </button>
  );
}
