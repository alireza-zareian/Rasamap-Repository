import type { Billboard } from "@/lib/types";
import { ShieldCheck, CheckCircle2, Pencil } from "lucide-react";
import { IRAN_LAT, IRAN_LNG } from "@/lib/domain/location";
import { faNum } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { cssVar } from "@/components/ui/css-var";
import { Badge } from "./Badge";
import styles from "./admin.module.css";
import own from "./QualityPanel.module.css";

interface Props {
  billboards: Billboard[];
  onFix?: (b: Billboard) => void;
}

type Severity = "high" | "medium" | "low";
const SEVERITY: Record<Severity, { label: string; tone: string; rank: number }> = {
  high:   { label: "بحرانی", tone: "var(--red)",        rank: 0 },
  medium: { label: "متوسط",  tone: "#f59e0b",           rank: 1 },
  low:    { label: "کم",     tone: "var(--text-muted)", rank: 2 },
};
/** How many rows are listed at once — the rest are counted, not drawn. */
const SHOWN = 100;

/** What is missing or wrong in one row, in the words the panel shows. */
function issuesOf(b: Billboard): string[] {
  const issues: string[] = [];
  const placed = b.lat != null && b.lng != null;
  if (!placed) issues.push("مختصات ندارد");
  if (!b.images || b.images.length === 0) issues.push("تصویر ندارد");
  if (!b.location || b.location.length < 5) issues.push("آدرس ناقص");
  if (b.price < 1) issues.push("قیمت نامعتبر");
  // The same box every schema that takes a coordinate reads, not a copy of it.
  if (b.lat != null && (b.lat < IRAN_LAT.min || b.lat > IRAN_LAT.max)) issues.push("مختصات خارج ایران");
  if (b.lng != null && (b.lng < IRAN_LNG.min || b.lng > IRAN_LNG.max)) issues.push("طول خارج ایران");
  return issues;
}

export function QualityPanel({ billboards, onFix }: Props) {
  const warnings = billboards
    .map(b => ({ b, issues: issuesOf(b) }))
    .filter(w => w.issues.length > 0)
    .map(w => ({ ...w, sev: (w.issues.length >= 3 ? "high" : w.issues.length >= 2 ? "medium" : "low") as Severity }))
    .sort((a, b) => SEVERITY[a.sev].rank - SEVERITY[b.sev].rank);
  const high = warnings.filter(w => w.sev === "high").length;

  return (
    <div>
      <div className={styles.head}>
        <h1 className={styles.title}><ShieldCheck size={16} /> کنترل کیفیت</h1>
        <div className={own.badges}>
          {high > 0 && <Badge text={`${faNum(high)} بحرانی`} tone="var(--red)" />}
          <Badge text={`${faNum(warnings.length)} از ${faNum(billboards.length)} رکورد بررسی‌شده`} tone={warnings.length > 0 ? "#f59e0b" : "var(--green)"} />
        </div>
      </div>
      <p className={styles.explain}>
        این فهرست هر بار از روی همان داده‌های زندهٔ بیلبوردها ساخته می‌شود؛ جای ذخیره‌شده‌ای ندارد.
        بررسی روی {faNum(billboards.length)} رکوردی انجام می‌شود که همین حالا در این پنل بارگذاری شده‌اند، نه روی کل جدول؛
        شمارش کل رکوردهای بدون تصویر و بدون مختصات در تب «نمای کلی» است.
        یک رکورد وقتی «مورد کیفیت» می‌شود که یکی از این نبودها را داشته باشد: مختصات نداشتن،
        تصویر نداشتن، آدرس کوتاه‌تر از ۵ نویسه، قیمت کمتر از ۱، یا مختصاتی که بیرون محدودهٔ ایران بیفتد.
        شدت هم از روی شمار همین ایرادها تعیین می‌شود: سه ایراد یا بیشتر «بحرانی»، دو ایراد «متوسط»،
        یک ایراد «کم». برای اصلاح، روی «اصلاح رکورد» بزنید تا همان بیلبورد در پنجرهٔ ویرایش باز شود؛
        بعد از ذخیره، همین فهرست دوباره حساب می‌شود.
      </p>
      {warnings.length === 0 ? (
        <div className={`${styles.state} ${styles.stateRow}`}><CheckCircle2 size={16} /> هیچ مشکلی یافت نشد</div>
      ) : (
        <ul className={own.list}>
          {warnings.slice(0, SHOWN).map(({ b, issues, sev }) => (
            <li key={b.id} className={own.row} style={cssVar("--tone", SEVERITY[sev].tone)}>
              <div>
                <h2 className={own.name}>{b.name.slice(0, 70)}</h2>
                <div className={own.issues}>{issues.map(issue => <Badge key={issue} text={issue} tone={SEVERITY[sev].tone} />)}</div>
              </div>
              <div className={own.side}>
                <div className={own.id}>#{b.id}</div>
                <Badge text={SEVERITY[sev].label} tone={SEVERITY[sev].tone} />
                {onFix && <Button size="sm" onClick={() => onFix(b)}><Pencil size={12} /> اصلاح رکورد</Button>}
              </div>
            </li>
          ))}
          {warnings.length > SHOWN && <li className={own.rest}>و {faNum(warnings.length - SHOWN)} مورد دیگر...</li>}
        </ul>
      )}
    </div>
  );
}
