"use client";
import Link from "next/link";
import { Megaphone, X, ArrowLeft } from "lucide-react";
import type { CatalogueItem } from "@/lib/types";
import { TypeIcon } from "@/components/media/TypeIcon";
import { Button } from "@/components/ui/Button";
import { MAX_PICKED } from "@/lib/client/use-campaign";
import { campaignHref } from "./campaign-href";
import { faNum } from "@/lib/format";
import styles from "./tray.module.css";

/**
 * The strip that collects the media picked for a campaign, fixed to the
 * bottom of the catalogue: what is in it, the monthly total, and the way to
 * the planner.
 */
export default function CampaignTray({ items, onRemove, onClear }: {
  items: CatalogueItem[];
  onRemove: (id: number) => void;
  onClear: () => void;
}) {
  if (items.length === 0) return null;
  const monthly = items.reduce((sum, b) => sum + b.price, 0);

  return (
    <div className={styles.tray} role="region" aria-label="رسانه‌های کمپین">
      <div className={styles.title}>
        <Megaphone size={15} /> کمپین
        <span className={styles.count}>{faNum(items.length)}/{faNum(MAX_PICKED)}</span>
      </div>
      <ul className={styles.chips}>
        {items.map(b => (
          <li key={b.id} className={styles.chip}>
            <TypeIcon type={b.type} size={13} />
            <span>{b.name}</span>
            <button type="button" className={styles.remove} onClick={() => onRemove(b.id)} aria-label={`حذف «${b.name}» از کمپین`}><X size={12} /></button>
          </li>
        ))}
      </ul>
      <div className={styles.total}>
        <strong>{faNum(monthly)}M</strong>
        <span>تومان / ماه</span>
      </div>
      <div className={styles.actions}>
        <Button size="sm" intent="quiet" onClick={onClear}>پاک</Button>
        <Link href={campaignHref(items.map(b => b.slug))} className={styles.go}>
          طرح کمپین <ArrowLeft size={14} />
        </Link>
      </div>
    </div>
  );
}
