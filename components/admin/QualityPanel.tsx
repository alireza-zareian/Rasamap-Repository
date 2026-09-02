import type { Billboard } from "@/lib/types";
import { C } from "./constants";
import { Badge } from "./Badge";
import { ShieldCheck, CheckCircle2, Pencil } from "lucide-react";

interface Props {
  billboards: Billboard[];
  onFix?: (b: Billboard) => void;
}

export function QualityPanel({ billboards, onFix }: Props) {
  const warnings: { id: number | string; name: string; issues: string[]; sev: "high" | "medium" | "low"; billboard: Billboard }[] = [];
  for (const b of billboards) {
    const issues: string[] = [];
    if (!b.lat || !b.lng) issues.push("مختصات ندارد");
    if (!b.images || b.images.length === 0) issues.push("تصویر ندارد");
    if (!b.location || b.location.length < 5) issues.push("آدرس ناقص");
    if (b.price < 1) issues.push("قیمت نامعتبر");
    if (b.lat && (b.lat < 24 || b.lat > 40)) issues.push("مختصات خارج ایران");
    if (b.lng && (b.lng < 44 || b.lng > 64)) issues.push("طول خارج ایران");
    if (issues.length > 0) warnings.push({ id: b.id, name: b.name, issues, sev: issues.length >= 3 ? "high" : issues.length >= 2 ? "medium" : "low", billboard: b });
  }
  const sevC: Record<string, string>  = { high: "#ef4444", medium: "#f59e0b", low: C.muted };
  const sevBg: Record<string, string> = { high: "rgba(239,68,68,0.1)", medium: "rgba(245,158,11,0.1)", low: C.surface };
  const sorted = [...warnings].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.sev] - { high: 0, medium: 1, low: 2 }[b.sev]));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.9rem", fontWeight: 700 }}><ShieldCheck size={16} /> کنترل کیفیت</div>
        <div style={{ display: "flex", gap: 8 }}>
          {warnings.filter(w => w.sev === "high").length > 0 && <Badge text={`${warnings.filter(w => w.sev === "high").length} بحرانی`} color="#ef4444" bg="rgba(239,68,68,0.1)" />}
          <Badge text={`${warnings.length} از ${billboards.length} رکورد بررسی‌شده`} color={warnings.length > 0 ? "#f59e0b" : C.green} bg={warnings.length > 0 ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)"} />
        </div>
      </div>
      <div style={{ fontSize: "0.75rem", color: C.muted, lineHeight: 1.9, marginBottom: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
        این فهرست هر بار از روی همان داده‌های زندهٔ بیلبوردها ساخته می‌شود؛ جای ذخیره‌شده‌ای ندارد.
        بررسی روی {billboards.length} رکوردی انجام می‌شود که همین حالا در این پنل بارگذاری شده‌اند، نه روی کل جدول؛
        شمارش کل رکوردهای بدون تصویر و بدون مختصات در تب «نمای کلی» است.
        یک رکورد وقتی «مورد کیفیت» می‌شود که یکی از این نبودها را داشته باشد: مختصات نداشتن،
        تصویر نداشتن، آدرس کوتاه‌تر از ۵ نویسه، قیمت کمتر از ۱، یا مختصاتی که بیرون محدودهٔ ایران بیفتد.
        شدت هم از روی شمار همین ایرادها تعیین می‌شود: سه ایراد یا بیشتر «بحرانی»، دو ایراد «متوسط»،
        یک ایراد «کم». برای اصلاح، روی «اصلاح رکورد» بزنید تا همان بیلبورد در پنجرهٔ ویرایش باز شود؛
        بعد از ذخیره، همین فهرست دوباره حساب می‌شود.
      </div>
      {warnings.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "40px 0", color: C.muted }}><CheckCircle2 size={16} /> هیچ مشکلی یافت نشد</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.slice(0, 100).map(w => (
            <div key={w.id} style={{ background: sevBg[w.sev], border: `1px solid ${sevC[w.sev]}30`, borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 6 }}>{w.name.slice(0, 70)}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{w.issues.map(issue => <Badge key={issue} text={issue} color={sevC[w.sev]} bg={sevBg[w.sev]} />)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                <div style={{ fontSize: "0.7rem", color: C.muted }}>#{w.id}</div>
                <Badge text={w.sev === "high" ? "بحرانی" : w.sev === "medium" ? "متوسط" : "کم"} color={sevC[w.sev]} bg={sevBg[w.sev]} />
                {onFix && (
                  <button onClick={() => onFix(w.billboard)} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.72rem", fontWeight: 700, padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.accent}40`, background: "rgba(255,77,0,0.08)", color: C.accent, fontFamily: C.font, cursor: "pointer", whiteSpace: "nowrap" }}>
                    <Pencil size={12} /> اصلاح رکورد
                  </button>
                )}
              </div>
            </div>
          ))}
          {warnings.length > 100 && <div style={{ textAlign: "center", color: C.muted, fontSize: "0.78rem", padding: 10 }}>و {warnings.length - 100} مورد دیگر...</div>}
        </div>
      )}
    </div>
  );
}
