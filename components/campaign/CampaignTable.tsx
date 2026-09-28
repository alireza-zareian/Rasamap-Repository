import Link from "next/link";
import { type CatalogueItem, typeLabels, availabilityLabels } from "@/lib/types";
import { TypeIcon } from "@/components/media/TypeIcon";
import { faNum } from "@/lib/format";
import { cssVar } from "@/components/ui/css-var";
import styles from "./table.module.css";

/**
 * The media of a campaign side by side, the best value of each measurable row
 * marked. A row compares numbers and shows text — parsing the text back read
 * "۵٬۰۰۰" as NaN. Wider than a phone with more than two columns, so it scrolls
 * sideways inside its own box with the row names pinned.
 */
interface Row {
  label: string;
  show: (b: CatalogueItem) => string;
  /** The number to compare, and whether more of it is better. Absent: not compared. */
  value?: (b: CatalogueItem) => number;
  higherIsBetter?: boolean;
}

const ROWS: Row[] = [
  { label: "نوع رسانه", show: b => typeLabels[b.type] },
  { label: "شهر", show: b => b.city },
  { label: "ابعاد", show: b => `${faNum(b.width)}×${faNum(b.height)} م` },
  { label: "مساحت (م²)", show: b => faNum(b.width * b.height), value: b => b.width * b.height, higherIsBetter: true },
  { label: "تعداد وجوه", show: b => faNum(b.faces), value: b => b.faces, higherIsBetter: true },
  { label: "بازدید روزانه (تخمین)", show: b => faNum(b.traffic.estimatedViews), value: b => b.traffic.estimatedViews, higherIsBetter: true },
  { label: "امتیاز دیده‌شدن", show: b => `${faNum(b.traffic.viewabilityScore)}/۱۰۰`, value: b => b.traffic.viewabilityScore, higherIsBetter: true },
  { label: "ترافیک سواره (روز)", show: b => faNum(b.traffic.daily), value: b => b.traffic.daily, higherIsBetter: true },
  { label: "ترافیک پیاده (روز)", show: b => faNum(b.traffic.pedestrian), value: b => b.traffic.pedestrian, higherIsBetter: true },
  { label: "قیمت ماهانه (M ت)", show: b => faNum(b.price), value: b => b.price, higherIsBetter: false },
  { label: "قیمت سالانه (M ت)", show: b => faNum(b.priceYearly), value: b => b.priceYearly, higherIsBetter: false },
  { label: "سن سازه (سال)", show: b => faNum(b.age) },
  { label: "امتیاز کاربران", show: b => (b.reviewCount > 0 ? `${faNum(b.rating)} (${faNum(b.reviewCount)} نظر)` : "بدون نظر"), value: b => (b.reviewCount > 0 ? b.rating : 0), higherIsBetter: true },
  { label: "وضعیت", show: b => availabilityLabels[b.availability] ?? b.availability },
];

/** The best value of a row across every column, or null when all are equal (nothing to mark). */
function bestOf(row: Row, items: CatalogueItem[]): number | null {
  if (!row.value || items.length < 2) return null;
  const values = items.map(row.value);
  const best = row.higherIsBetter ? Math.max(...values) : Math.min(...values);
  return values.every(v => v === best) ? null : best;
}

export default function CampaignTable({ items }: { items: CatalogueItem[] }) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table} style={cssVar("--cols", String(items.length))}>
        <thead className={styles.head}>
          <tr>
            <td />
            {items.map(m => (
              <th key={m.id} scope="col">
                <div className={styles.headIcon}><TypeIcon type={m.type} size={26} /></div>
                <div className={styles.headName}>{m.name}</div>
                <div className={styles.headRegion}>{m.region}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(row => {
            const best = bestOf(row, items);
            return (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {items.map(m => (
                  <td key={m.id} className={best !== null && row.value!(m) === best ? styles.better : undefined}>{row.show(m)}</td>
                ))}
              </tr>
            );
          })}
          {/* The next step is the media's own page, where the owner's number is. */}
          <tr className={styles.cta}>
            <td />
            {items.map(m => <td key={m.id}><Link href={`/billboard/${m.slug}`}>مشاهده و تماس</Link></td>)}
          </tr>
        </tbody>
      </table>
      <div className={styles.legend}>★ سبز = بهترین در این معیار</div>
    </div>
  );
}
