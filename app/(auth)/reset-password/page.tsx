"use client";
import { useState } from "react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import { faNum } from "@/lib/format";
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from "@/lib/domain/password";
import { latinDigits } from "@/lib/domain/digits";
import field from "@/components/ui/form.module.css";
import styles from "../auth.module.css";

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

  const sendCode = async () => {
    setError("");
    if (!/^09\d{9}$/.test(phone)) { setError("شماره موبایل معتبر نیست"); return; }
    setLoading(true);
    try {
      const data = await fetchJson<{ message?: string; devCode?: string }>("/api/auth/otp/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "password_reset" }),
      });
      setNotice(data.message ?? "اگر این شماره ثبت شده باشد، کد تأیید ارسال شد.");
      if (data.devCode) setNotice(n => `${n} (کد تست: ${data.devCode})`);
      setStep(2);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  };

  const verify = async () => {
    setError("");
    if (!/^\d{6}$/.test(code)) { setError("کد باید ۶ رقم باشد"); return; }
    if (pass.length < MIN_PASSWORD_LENGTH) { setError(PASSWORD_TOO_SHORT); return; }
    if (pass !== confirm) { setError("رمز عبور و تکرار آن یکسان نیستند"); return; }
    setLoading(true);
    try {
      await fetchJson("/api/auth/otp/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "password_reset", code, newPassword: pass }),
      });
      setStep(3);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  };

  const input = `${field.input} ${styles.input}`;

  return (
    <div className={styles.column}>
      <div className={styles.brand}>
        <div className={styles.mark}>R</div>
        <h1 className={`${styles.name} logo-shimmer`}>بازیابی رمز عبور</h1>
        <div className={styles.tagline}>با کد پیامکی رمز جدید بگذارید</div>
      </div>

      <div className={styles.card}>
        {step === 3 ? (
          <div className={`${styles.form} ${styles.done}`}>
            <Check size={44} strokeWidth={1.6} />
            <h2>رمز عبور تغییر کرد</h2>
            <p>حالا می‌توانید با رمز جدید وارد شوید.</p>
            <button type="button" className={styles.submit} onClick={() => router.push("/login")}>رفتن به ورود</button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={e => { e.preventDefault(); if (!loading) void (step === 1 ? sendCode() : verify()); }}>
            {notice && step === 2 && <div role="status" className={styles.notice}>{notice}</div>}
            {error && <div role="alert" className={field.error}><AlertTriangle size={13} /> {error}</div>}

            {step === 1 ? (
              <>
                <div className={styles.field}>
                  <label htmlFor="reset-phone" className={styles.label}>شماره موبایل حساب</label>
                  <input id="reset-phone" className={`${input} ${field.ltr}`} value={phone} onChange={e => setPhone(latinDigits(e.target.value))}
                    type="tel" inputMode="tel" dir="ltr" lang="en" autoComplete="tel" placeholder="09123456789" />
                </div>
                <button type="submit" className={styles.submit} disabled={loading}>{loading ? "در حال ارسال…" : "ارسال کد تأیید"}</button>
              </>
            ) : (
              <>
                <div className={styles.field}>
                  <label htmlFor="reset-code" className={styles.label}>کد ۶ رقمی پیامک‌شده</label>
                  <input id="reset-code" className={`${input} ${styles.code}`} value={code}
                    onChange={e => setCode(latinDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric" dir="ltr" autoComplete="one-time-code" placeholder="------" />
                </div>
                <div className={styles.field}>
                  <label htmlFor="reset-pass" className={styles.label}>رمز عبور جدید</label>
                  <input id="reset-pass" className={input} value={pass} onChange={e => setPass(latinDigits(e.target.value))}
                    type="password" autoComplete="new-password" placeholder={`حداقل ${faNum(MIN_PASSWORD_LENGTH)} نویسه`} />
                </div>
                <input aria-label="تکرار رمز عبور جدید" className={input} value={confirm} onChange={e => setConfirm(latinDigits(e.target.value))}
                  type="password" autoComplete="new-password" placeholder="تکرار رمز عبور جدید" />
                <button type="submit" className={styles.submit} disabled={loading}>{loading ? "در حال ثبت…" : "ثبت رمز جدید"}</button>
                <button type="button" className={styles.textButton} onClick={() => { setStep(1); setError(""); }}>شماره را اشتباه وارد کردم</button>
              </>
            )}
          </form>
        )}
      </div>

      <div className={styles.back}><Link href="/login"><ArrowRight size={13} /> بازگشت به ورود</Link></div>
    </div>
  );
}
