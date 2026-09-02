"use client";
import { useState, useEffect } from "react";
import { Billboard } from "@/lib/types";
import { X, Check, AlertTriangle, Info, ArrowRight, ArrowLeft, CalendarX } from "lucide-react";

interface Props {
  billboard: Billboard | null;
  onClose: () => void;
  onSuccess: () => void;
}

const durations = [
  { label: "۱ هفته",  days: 7,   discount: 0 },
  { label: "۲ هفته",  days: 14,  discount: 0 },
  { label: "۱ ماه",   days: 30,  discount: 0 },
  { label: "۲ ماه",   days: 60,  discount: 0 },
  { label: "۳ ماه (۱۰٪ تخفیف)", days: 90,  discount: 0.1 },
  { label: "۶ ماه (۱۵٪ تخفیف)", days: 180, discount: 0.15 },
  { label: "۱ سال (۲۰٪ تخفیف)", days: 365, discount: 0.2 },
];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// The API rejects a start date that is not strictly in the future, so the
// picker defaults to (and cannot go below) tomorrow — otherwise a user who
// just clicks through hits "تاریخ شروع نمی‌تواند در گذشته باشد".
function tomorrowStr() {
  return addDays(todayStr(), 1);
}

interface BookedRange { startDate: string; endDate: string; status: string }

export default function BookingModal({ billboard: b, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({ start: tomorrowStr(), duration: 2, note: "" });
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<BookedRange[]>([]);

  useEffect(() => {
    if (!b) return;
    let live = true;
    fetch(`/api/reservations?billboardId=${b.id}`)
      .then(r => r.ok ? r.json() : { reservations: [] })
      .then(d => { if (live) setBooked(d.reservations ?? []); })
      .catch(() => {});
    return () => { live = false; };
  }, [b]);

  if (!b) return null;

  const dur = durations[form.duration];
  const months = dur.days / 30;
  const base = Math.round(b.price * months);
  const discount = Math.round(base * dur.discount);
  const total = base - discount;
  const endDate = form.start ? addDays(form.start, dur.days) : "";

  // Two [start,end) ranges overlap iff each starts before the other ends.
  const clashesWith = booked.find(r => form.start < r.endDate.slice(0, 10) && endDate > r.startDate.slice(0, 10));

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (loading) return;                       // ignore a double-tap while a request is in flight
    if (!form.start) { setError("تاریخ شروع را انتخاب کنید"); return; }
    if (form.start < tomorrowStr()) { setError("تاریخ شروع باید از فردا به بعد باشد"); return; }
    if (clashesWith) { setError("این بازه با یک رزرو موجود تداخل دارد. تاریخ دیگری انتخاب کنید."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billboardId: b.id,
          startDate: form.start,
          endDate,
          note: form.note || undefined,
        }),
      });
      if (res.redirected && res.url.includes("/login")) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        const secs = Number(res.headers.get("Retry-After")) || 0;
        const mins = Math.ceil(secs / 60);
        setError(
          mins > 0
            ? `درخواست‌های زیادی فرستاده شده. لطفاً ${mins.toLocaleString("fa-IR")} دقیقه دیگر دوباره تلاش کنید.`
            : (data.error ?? "درخواست‌های زیادی فرستاده شده. کمی بعد دوباره تلاش کنید."),
        );
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "خطا در ثبت رزرو");
        setLoading(false);
        return;
      }
      onSuccess();
    } catch {
      setError("خطای شبکه");
      setLoading(false);
    }
  };

  const iS: React.CSSProperties = {
    width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)",
    color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.88rem",
    padding: "10px 14px", borderRadius: 8, outline: "none",
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(6,10,18,0.9)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>رزرو آنلاین رسانه</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{b.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", padding: "14px 22px", gap: 8 }}>
          {["زمان‌بندی", "تأیید"].map((s, i) => (
            <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, background: step > i + 1 ? "var(--green)" : step === i + 1 ? "var(--accent)" : "var(--bg-surface)", color: step >= i + 1 ? "#fff" : "var(--text-muted)", border: `1px solid ${step >= i + 1 ? "transparent" : "var(--border)"}` }}>
                {step > i + 1 ? <Check size={14} /> : i + 1}
              </div>
              <div style={{ fontSize: "0.68rem", color: step === i + 1 ? "var(--accent)" : "var(--text-muted)" }}>{s}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: "4px 22px 18px" }}>
          {step === 1 && (
            <div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>تاریخ شروع اکران *</label>
                <input type="date" value={form.start} min={tomorrowStr()} onChange={e => set("start", e.target.value)} style={{ ...iS, direction: "ltr" }} />
                {endDate && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 4 }}>تاریخ پایان: <span style={{ color: "var(--text-main)" }}>{endDate}</span></div>}
                {booked.length > 0 && (
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 8, lineHeight: 1.9 }}>
                    بازه‌های رزروشده:
                    {booked.map((r, i) => (
                      <span key={i} style={{ display: "inline-block", marginInlineStart: 6, padding: "1px 8px", borderRadius: 20, background: "var(--bg-surface)", border: "1px solid var(--border)", direction: "ltr" }}>
                        {r.startDate.slice(0, 10)} — {r.endDate.slice(0, 10)}
                      </span>
                    ))}
                  </div>
                )}
                {clashesWith && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "#ef4444" }}>
                    <CalendarX size={13} /> این بازه با یک رزرو موجود تداخل دارد.
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: 8 }}>مدت اکران</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {durations.map((d, i) => (
                    <label key={d.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: form.duration === i ? "rgba(59,123,245,0.08)" : "var(--bg-surface)", border: `1px solid ${form.duration === i ? "var(--accent)" : "var(--border)"}`, borderRadius: 8, cursor: "pointer" }}>
                      <input type="radio" checked={form.duration === i} onChange={() => set("duration", i)} style={{ accentColor: "var(--accent)" }} />
                      <span style={{ flex: 1, fontSize: "0.83rem" }}>{d.label}</span>
                      {d.discount > 0 && <span style={{ fontSize: "0.72rem", color: "var(--green)", fontWeight: 600 }}>-{d.discount * 100}٪</span>}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>توضیحات (اختیاری)</label>
                <input value={form.note} onChange={e => set("note", e.target.value)} placeholder="نیاز به طراحی دارم، ..." style={iS} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ background: "var(--bg-surface)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 12, color: "var(--text-muted)" }}>خلاصه سفارش</div>
                {([
                  ["رسانه", b.name.substring(0, 35)],
                  ["تاریخ شروع", form.start],
                  ["تاریخ پایان", endDate],
                  ["مدت", dur.label],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: "0.82rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>{l}</span>
                    <span style={{ fontWeight: 500, maxWidth: "60%", textAlign: "left" }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "2px solid var(--border)" }}>
                  {dur.discount > 0 && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 6 }}>
                        <span style={{ color: "var(--text-muted)" }}>قیمت پایه</span>
                        <span style={{ textDecoration: "line-through", color: "var(--text-muted)" }}>{base}M تومان</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 6 }}>
                        <span style={{ color: "var(--green)" }}>تخفیف</span>
                        <span style={{ color: "var(--green)", fontWeight: 600 }}>-{discount}M تومان</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.05rem", fontWeight: 800 }}>
                    <span>جمع کل</span>
                    <span style={{ color: "var(--accent)" }}>{total}M تومان</span>
                  </div>
                </div>
              </div>
              {error && (
                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: "0.8rem", color: "#ef4444", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> {error}</div>
              )}
              <div style={{ background: "rgba(59,123,245,0.06)", border: "1px solid rgba(59,123,245,0.25)", borderRadius: 8, padding: "12px 14px", fontSize: "0.78rem", lineHeight: 1.8 }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}><Info size={13} /> نحوه تأیید رزرو</div>
                <div style={{ color: "var(--text-muted)" }}>
                  درخواست شما ثبت می‌شود و کارشناسان رسامپ برای هماهنگی با صاحب رسانه با شما تماس می‌گیرند.
                  رزرو نهایی پس از تأیید هر دو طرف اعمال می‌شود.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          {step > 1 && <button onClick={() => setStep(s => s - 1)} style={{ border: "1px solid var(--border)", background: "none", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.82rem", padding: "9px 18px", borderRadius: 8, cursor: "pointer", flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}><ArrowRight size={14} /> قبلی</button>}
          <button onClick={onClose} style={{ border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", fontFamily: "inherit", fontSize: "0.82rem", padding: "9px 14px", borderRadius: 8, cursor: "pointer" }}>انصراف</button>
          {step < 2
            ? <button onClick={() => setStep(s => s + 1)} disabled={!form.start || !!clashesWith} style={{ background: "var(--accent)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.85rem", fontWeight: 700, padding: "9px 24px", borderRadius: 8, cursor: (!form.start || clashesWith) ? "not-allowed" : "pointer", flex: 2, opacity: (!form.start || clashesWith) ? 0.5 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}>بعدی <ArrowLeft size={14} /></button>
            : <button onClick={handleSubmit} disabled={loading} style={{ background: loading ? "var(--border)" : "var(--green)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.85rem", fontWeight: 700, padding: "9px 24px", borderRadius: 8, cursor: loading ? "default" : "pointer", flex: 2, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {loading ? "در حال ثبت..." : <><Check size={15} /> ثبت نهایی رزرو</>}
              </button>
          }
        </div>
      </div>
    </div>
  );
}
