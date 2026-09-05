"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check } from "lucide-react";

const toLatin = (v: string) =>
  v.replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
   .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));

export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const inp: React.CSSProperties = {
    width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)",
    color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.88rem",
    padding: "11px 14px", borderRadius: 9, outline: "none", boxSizing: "border-box",
    display: "block", marginBottom: 14,
  };

  const sendCode = async () => {
    setError("");
    if (!/^09\d{9}$/.test(phone)) { setError("شماره موبایل معتبر نیست"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "password_reset" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) { setError(data.error ?? "درخواست‌های زیادی. کمی بعد دوباره تلاش کنید."); setLoading(false); return; }
      if (!res.ok) { setError(data.error ?? "خطا در ارسال کد"); setLoading(false); return; }
      setNotice(data.message ?? "اگر این شماره ثبت شده باشد، کد تأیید ارسال شد.");
      if (data.devCode) setNotice(n => `${n} (کد تست: ${data.devCode})`);
      setStep(2);
    } catch { setError("خطای شبکه"); }
    finally { setLoading(false); }
  };

  const verify = async () => {
    setError("");
    if (!/^\d{6}$/.test(code)) { setError("کد باید ۶ رقم باشد"); return; }
    if (pass.length < 6) { setError("رمز عبور باید حداقل ۶ کاراکتر باشد"); return; }
    if (pass !== confirm) { setError("رمز عبور و تکرار آن یکسان نیستند"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "password_reset", code, newPassword: pass }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "خطا در تغییر رمز"); setLoading(false); return; }
      setStep(3);
    } catch { setError("خطای شبکه"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", direction: "rtl" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, background: "var(--accent)", borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 900, color: "#fff", boxShadow: "0 0 24px rgba(59,123,245,0.45)", marginBottom: 10 }}>R</div>
          <div className="logo-shimmer" style={{ fontSize: "1.4rem", fontWeight: 800 }}>بازیابی رمز عبور</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 3 }}>با کد پیامکی رمز جدید بگذارید</div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,0.4)" }}>
          {notice && step === 2 && (
            <div style={{ background: "rgba(59,123,245,0.08)", border: "1px solid rgba(59,123,245,0.25)", borderRadius: 8, padding: "9px 13px", fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.7 }}>{notice}</div>
          )}
          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "9px 13px", fontSize: "0.8rem", color: "#ef4444", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> {error}</div>
          )}

          {step === 1 && (
            <form onSubmit={e => { e.preventDefault(); if (!loading) sendCode(); }}>
              <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>شماره موبایل حساب</label>
              <input value={phone} onChange={e => setPhone(toLatin(e.target.value))} type="tel" inputMode="tel" dir="ltr" lang="en" placeholder="09123456789" style={{ ...inp, textAlign: "left" }} />
              <button type="submit" disabled={loading} style={{ width: "100%", background: loading ? "var(--border)" : "var(--accent)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 700, padding: "13px", borderRadius: 9, cursor: loading ? "default" : "pointer" }}>
                {loading ? "در حال ارسال..." : "ارسال کد تأیید"}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={e => { e.preventDefault(); if (!loading) verify(); }}>
              <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>کد ۶ رقمی پیامک‌شده</label>
              <input value={code} onChange={e => setCode(toLatin(e.target.value).replace(/\D/g, "").slice(0, 6))} inputMode="numeric" dir="ltr" placeholder="------" style={{ ...inp, textAlign: "center", letterSpacing: 6, fontSize: "1.1rem" }} />
              <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>رمز عبور جدید</label>
              <input value={pass} onChange={e => setPass(e.target.value)} type="password" placeholder="حداقل ۶ کاراکتر" style={inp} />
              <input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" placeholder="تکرار رمز عبور جدید" style={inp} />
              <button type="submit" disabled={loading} style={{ width: "100%", background: loading ? "var(--border)" : "var(--accent)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 700, padding: "13px", borderRadius: 9, cursor: loading ? "default" : "pointer" }}>
                {loading ? "در حال ثبت..." : "ثبت رمز جدید"}
              </button>
              <button type="button" onClick={() => { setStep(1); setError(""); }} style={{ width: "100%", background: "none", border: "none", color: "var(--text-muted)", fontFamily: "inherit", fontSize: "0.78rem", marginTop: 10, cursor: "pointer" }}>
                شماره را اشتباه وارد کردم
              </button>
            </form>
          )}

          {step === 3 && (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "var(--green)" }}><Check size={44} strokeWidth={1.6} /></div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 6 }}>رمز عبور تغییر کرد</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 18 }}>حالا می‌توانید با رمز جدید وارد شوید.</div>
              <button onClick={() => router.push("/login")} style={{ background: "var(--accent)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.88rem", fontWeight: 700, padding: "11px 28px", borderRadius: 9, cursor: "pointer" }}>
                رفتن به ورود
              </button>
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link href="/login" style={{ color: "var(--text-muted)", fontSize: "0.78rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><ArrowRight size={13} /> بازگشت به ورود</Link>
        </div>
      </div>
    </div>
  );
}
