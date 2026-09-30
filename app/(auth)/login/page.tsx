"use client";
import { useState, Suspense } from "react";
import { useCurrentUser } from "@/lib/client/use-current-user";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import { safeNextPath } from "@/lib/client/next-path";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, AlertTriangle, ArrowRight, User, ShieldCheck } from "lucide-react";
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from "@/lib/domain/password";
import { latinDigits } from "@/lib/domain/digits";
import { cssVar } from "@/components/ui/css-var";
import field from "@/components/ui/form.module.css";
import styles from "../auth.module.css";

function LoginForm() {
  const router = useRouter();
  const { refresh } = useCurrentUser();
  const searchParams = useSearchParams();
  const requestedNext = safeNextPath(searchParams.get("next"));

  /**
   * Which kind of account the form is dressed for — field, wording and colour
   * only. The server decides from the shape of what was typed (an email is
   * staff, a mobile number a customer) and never reads this. /admin/login
   * forwards here with the staff mode chosen.
   */
  const [mode, setMode] = useState<"customer" | "staff">(
    searchParams.get("as") === "staff" ? "staff" : "customer",
  );
  const staff = mode === "staff";

  const [tab, setTab] = useState<"login"|"register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ phone: "", pass: "", name: "", confirm: "", code: "" });
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const s = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  /**
   * The sign-up step on screen: "phone" sends a code; "details" sends the code
   * with the name and password in one register call, so a number is never
   * proven without an account being made.
   */
  const [signUpStep, setSignUpStep] = useState<"phone" | "details">("phone");
  const [notice, setNotice] = useState("");

  const switchTab = (next: "login" | "register") => {
    setTab(next);
    setError(""); setNotice("");
    setSignUpStep("phone");
  };

  const switchMode = (next: "customer" | "staff") => {
    setMode(next);
    switchTab("login");         // staff accounts are created by an admin, never here
    setForm(f => ({ ...f, phone: "" }));
  };

  // Step one of sign-up: ask for a code on the number that was typed.
  const sendCode = async () => {
    setError("");
    if (!/^09\d{9}$/.test(form.phone)) { setError("شماره موبایل معتبر نیست"); return; }
    setLoading(true);
    try {
      const data = await fetchJson<{ message?: string; devCode?: string }>("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.phone, purpose: "register" }),
      });
      setNotice(data.devCode
        ? `${data.message} (کد تست: ${data.devCode})`
        : data.message ?? "کد تأیید ارسال شد.");
      setSignUpStep("details");
    } catch (err) {
      // Including the 409 for a registered number, whose message says to sign in.
      setError(errorMessage(err));
    } finally { setLoading(false); }
  };

  const submit = async () => {
    setError("");
    if (tab === "register") {
      if (!/^\d{6}$/.test(form.code)) { setError("کد تأیید باید ۶ رقم باشد"); return; }
      if (!form.name.trim()) { setError("نام الزامی است"); return; }
      if (form.pass !== form.confirm) { setError("رمز عبور و تکرار آن یکسان نیستند"); return; }
      if (form.pass.length < MIN_PASSWORD_LENGTH) { setError(PASSWORD_TOO_SHORT); return; }
    }
    setLoading(true);
    try {
      const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register";
      // Sign-in takes a mobile number or a staff email; sign-up is customers only.
      const body = tab === "login"
        ? { identifier: form.phone.trim(), password: form.pass }
        : { name: form.name.trim(), phone: form.phone, password: form.pass, code: form.code };
      const data = await fetchJson<{ user?: { isStaff?: boolean } }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // CurrentUserProvider asks once per page load, and router.push is a soft
      // navigation: without this the header would still show "signed out".
      await refresh();
      // Where they were headed, else the panel or the dashboard.
      router.push(requestedNext ?? (data.user?.isStaff ? "/admin" : "/dashboard"));
    } catch (err) {
      // A refusal or a network failure — fetchJson already made it a sentence.
      setError(errorMessage(err)); setLoading(false);
    }
  };

  // Sign-up in its customer form, and which of its two steps is on screen.
  const signUp = tab === "register" && !staff;
  const askingForCode = signUp && signUpStep === "phone";
  const detailsStep  = signUp && signUpStep === "details";

  // The six-digit code from the SMS — same shape as /reset-password's box.
  const codeInp = () => (
    <input
      className={`${field.input} ${styles.input} ${styles.code}`}
      value={form.code}
      onChange={e => s("code", latinDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric" dir="ltr" autoComplete="one-time-code"
      aria-label="کد تأیید پیامک‌شده"
      placeholder="------"
    />
  );

  const nameInp = () => (
    <input className={`${field.input} ${styles.input}`} value={form.name} onChange={e => s("name", e.target.value)}
      type="text" autoComplete="name" aria-label="نام و نام خانوادگی" placeholder="نام و نام خانوادگی" />
  );

  // An email keyboard for staff, a phone keypad for customers; the server
  // reads the value's own shape either way.
  const identifierInp = () => (
    // Read-only once a code is sent — the code belongs to this number. The
    // "wrong number" button is the way back.
    <input
      className={`${field.input} ${field.ltr} ${styles.input}`}
      value={form.phone}
      onChange={e => s("phone", staff ? e.target.value : latinDigits(e.target.value))}
      readOnly={detailsStep}
      type={staff ? "email" : "tel"}
      inputMode={staff ? "email" : "tel"}
      dir="ltr" lang="en"
      autoComplete={staff ? "email" : "tel"}
      aria-label={staff ? "ایمیل سازمانی" : "شماره موبایل"}
      placeholder={staff ? "name@rasamap.ir" : "09123456789"}
    />
  );

  // Persian digits are converted as typed, to show what will be sent; the server converts them too.
  const passInp = (
    value: string,
    onChange: (v: string) => void,
    label: string,
    show: boolean,
    setShow: (b: boolean) => void,
    autoComplete: "current-password" | "new-password",
  ) => (
    <div className={styles.password}>
      <input
        className={`${field.input} ${field.ltr} ${styles.input}`}
        value={value}
        onChange={e => onChange(latinDigits(e.target.value))}
        type={show ? "text" : "password"}
        dir="ltr" lang="en"
        aria-label={label}
        placeholder={label}
        autoComplete={autoComplete}
      />
      <button type="button" className={styles.reveal} onClick={() => setShow(!show)}
        aria-label={show ? "پنهان کردن رمز" : "نمایش رمز"} tabIndex={-1}>
        {show ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
    </div>
  );

  const tabs = staff ? (["login"] as const) : (["login", "register"] as const);

  return (
    <div className={`${styles.column} ${staff ? styles.staff : ""}`}>
      <div className={styles.brand}>
        <div className={styles.mark}>{staff ? <ShieldCheck size={26} /> : "R"}</div>
        <h1 className={`${styles.name} logo-shimmer`}>رسامپ</h1>
        <div className={styles.tagline}>{staff ? "ورود همکاران — پنل مدیریت رسامپ" : "پلتفرم جامع رسانه‌های محیطی ایران"}</div>
      </div>

      <div className={styles.card}>
        {/* Staff accounts are made by an admin, so staff mode has no sign-up tab. */}
        <div className={styles.tabs} role="tablist">
          {tabs.map(t => (
            <button key={t} type="button" id={`tab-${t}`} role="tab" aria-selected={tab === t}
              className={styles.tab} onClick={() => switchTab(t)}>
              {t === "login" ? (staff ? "ورود همکاران" : "ورود") : "ثبت‌نام"}
            </button>
          ))}
        </div>
        {/* A real <form>, so Enter submits. */}
        <form className={styles.form} role="tabpanel" aria-labelledby={`tab-${tab}`}
          onSubmit={e => { e.preventDefault(); if (!loading) void (askingForCode ? sendCode() : submit()); }}>
          {notice && detailsStep && <div role="status" className={styles.notice}>{notice}</div>}
          {/* Step one is the number alone. */}
          {identifierInp()}
          {detailsStep && codeInp()}
          {detailsStep && nameInp()}
          {!askingForCode && passInp(form.pass, v => s("pass", v), "رمز عبور", showPass, setShowPass, signUp ? "new-password" : "current-password")}
          {detailsStep && passInp(form.confirm, v => s("confirm", v), "تکرار رمز", showConfirm, setShowConfirm, "new-password")}
          {error && <div role="alert" className={field.error}><AlertTriangle size={13} /> {error}</div>}
          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? "در حال پردازش…"
              : staff ? "ورود به پنل مدیریت"
              : tab === "login" ? "ورود به حساب"
              : askingForCode ? "ارسال کد تأیید"
              : "ایجاد حساب"}
          </button>
          {detailsStep && (
            <button type="button" className={styles.textButton}
              onClick={() => { setSignUpStep("phone"); setError(""); setNotice(""); s("code", ""); }}>
              شماره را اشتباه وارد کردم
            </button>
          )}
          {tab === "login" && !staff && (
            <div className={styles.aside}><Link href="/reset-password">رمز عبور را فراموش کرده‌اید؟</Link></div>
          )}
          {staff && <div className={styles.aside}>بازیابی رمز همکاران از طریق سوپر ادمین انجام می‌شود</div>}
        </form>
      </div>

      {/* The mode switch: presentation only. */}
      <div className={styles.modes}>
        {([
          { key: "customer", label: "کاربر",   hint: "با شماره موبایل",  Icon: User,        color: "var(--accent)" },
          { key: "staff",    label: "همکاران", hint: "با ایمیل سازمانی", Icon: ShieldCheck, color: "#6247C4" },
        ] as const).map(opt => (
          <button key={opt.key} type="button" className={styles.mode} style={cssVar("--mode", opt.color)}
            onClick={() => switchMode(opt.key)} aria-pressed={mode === opt.key}>
            <span className={styles.modeLabel}><opt.Icon size={14} /> {opt.label}</span>
            <span className={styles.modeHint}>{opt.hint}</span>
          </button>
        ))}
      </div>

      <div className={styles.back}><Link href="/"><ArrowRight size={13} /> بازگشت</Link></div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
