import Link from "next/link";
import { type CatalogueItem, typeLabels, availabilityLabels } from "@/lib/types";
import { TypeIcon } from "@/components/media/TypeIcon";
import { faNum } from "@/lib/format";
import styles from "./compare.module.css";

/**
 * Two media side by side, the better value of each measurable row marked. A
 * row compares numbers and shows text — parsing the text back read "۵٬۰۰۰" as NaN.
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
  { label: "منطقه", show: b => b.region },
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

function isBetter(row: Row, mine: CatalogueItem, other: CatalogueItem): boolean {
  if (!row.value) return false;
  const a = row.value(mine), b = row.value(other);
  return row.higherIsBetter ? a > b : a < b;
}

export default function CompareTable({ items: [a, b], onLeave }: { items: [CatalogueItem, CatalogueItem]; onLeave?: () => void }) {
  return (
    <>
      <table className={styles.table}>
        <thead className={styles.head}>
          <tr>
            <td />
            {[a, b].map(m => (
              <th key={m.id} scope="col">
                <div className={styles.headIcon}><TypeIcon type={m.type} size={30} /></div>
                <div className={styles.headName}>{m.name}</div>
                <div className={styles.headRegion}>{m.region}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(row => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {[[a, b], [b, a]].map(([mine, other]) => (
                <td key={mine.id} className={isBetter(row, mine, other) ? styles.better : undefined}>{row.show(mine)}</td>
              ))}
            </tr>
          ))}
          {/* The next step is the media's own page, where the owner's number is. */}
          <tr className={styles.cta}>
            <td />
            {[a, b].map(m => <td key={m.id}><Link href={`/billboard/${m.slug}`} onClick={onLeave}>مشاهده و تماس</Link></td>)}
          </tr>
        </tbody>
      </table>
      <div className={styles.legend}>★ سبز = بهتر در این معیار</div>
    </>
  );
}
