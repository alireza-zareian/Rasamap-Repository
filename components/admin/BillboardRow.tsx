import { sourceLabel, type Billboard } from "@/lib/types";
import { Check, AlertTriangle } from "lucide-react";
import { faNum } from "@/lib/format";
import { TypeIcon } from "@/components/TypeIcon";
import { Button } from "@/components/ui/Button";
import { availabilityTone } from "@/components/ui/availability";
import { AVAILABILITY_LABEL, MODERATION_LABEL, TYPE_LABEL, moderationTone } from "./constants";
import { Badge } from "./Badge";
import styles from "./admin.module.css";
import own from "./BillboardsPanel.module.css";

export function BillboardRow({ b, onEdit, onDelete, onVisibility }: {
  b: Billboard;
  onEdit: (b: Billboard) => void;
  onDelete: (b: Billboard) => void;
  /** Take a published row down, or put a taken-down one back. */
  onVisibility: (b: Billboard) => void;
}) {
  // A row still in review shows where it is in review — that is what an admin
  // needs to act on. A published row shows whether the board is free.
  const inReview = b.moderation !== "approved";
  const [label, tone] = inReview
    ? [MODERATION_LABEL[b.moderation], moderationTone(b.moderation)]
    : [AVAILABILITY_LABEL[b.availability], availabilityTone(b.availability)];
  return (
    <tr>
      <td className={own.nameCell}>
        <div className={own.name}><TypeIcon type={b.type} size={13} /> {b.name}</div>
        <div className={own.place}>{b.city} · {b.location?.slice(0, 38)}</div>
      </td>
      <td className={styles.muted}>{TYPE_LABEL[b.type] ?? b.type}</td>
      <td><Badge text={label ?? b.moderation} tone={tone} /></td>
      <td>{faNum(b.price)}M</td>
      <td>
        {b.lat != null && b.lng != null
          ? <span className={styles.ok}><Check size={12} /> {b.lat.toFixed(4)}</span>
          : <span className={styles.warn}><AlertTriangle size={12} /> ندارد</span>}
      </td>
      <td>
        {b.images?.length > 0
          ? <span className={styles.ok}><Check size={12} /> {faNum(b.images.length)}</span>
          : <span className={styles.warn}><AlertTriangle size={12} /> ۰</span>}
      </td>
      <td className={styles.muted}>{sourceLabel(b.source)}</td>
      <td>
        <div className={styles.actions}>
          <Button size="sm" intent="primary" onClick={() => onEdit(b)}>ویرایش</Button>
          {(b.moderation === "approved" || b.moderation === "suspended") && (
            <Button size="sm" intent="quiet" onClick={() => onVisibility(b)}>
              {b.moderation === "approved" ? "توقف انتشار" : "انتشار دوباره"}
            </Button>
          )}
          <Button size="sm" intent="danger" onClick={() => onDelete(b)}>حذف</Button>
        </div>
      </td>
    </tr>
  );
}
