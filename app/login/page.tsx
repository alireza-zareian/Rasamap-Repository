"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, AlertTriangle, ArrowRight, User, ShieldCheck } from "lucide-react";

// Persian/Arabic digits → Latin digits
const toLatin = (v: string) =>
  v.replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
   .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next") ?? "";
  // Only allow same-origin paths (start with / but not //)
  const nextPath = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  /**
   * Which kind of account the form is dressed for.
   *
   * A label only. The server decides from the shape of what was typed — an
   * email goes to `admins`, a mobile number to `users` — and never reads a mode
   * the browser claims, because a client-declared role is not a fact. Switching
   * here changes the field, the wording and the colour, so a member of the team
   * is not left typing an email into a box asking for 09…
   *
   * It is not hidden, and hiding it would buy nothing: /admin/login is a public
   * page already. Shopify and Zendesk put the same switch on the same screen.
   */
  const [mode, setMode] = useState<"customer" | "staff">(
    searchParams.get("as") === "staff" ? "staff" : "customer",
  );
  const staff = mode === "staff";

  const [tab, setTab] = useState<"login"|"register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ phone: "", pass: "", name: "", confirm: "" });
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const s = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const switchMode = (next: "customer" | "staff") => {
    setMode(next);
    setTab("login");            // staff accounts are created by an admin, never here
    setError("");
    setForm(f => ({ ...f, phone: "" }));
  };

  const submit = async () => {
    setError("");
    if (tab === "register") {
      if (!form.name.trim()) { setError("نام الزامی است"); return; }
      if (form.pass !== form.confirm) { setError("رمز عبور و تکرار آن یکسان نیستند"); return; }
      if (form.pass.length < 6) { setError("رمز عبور باید حداقل ۶ کاراکتر باشد"); return; }
    }
    setLoading(true);
    try {
      const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register";
      // Signing in accepts a mobile number or a team email address — the server
      // reads the shape of it to know which store to check. Registration is for
      // customers only, so it stays a phone.
      const body = tab === "login"
        ? { identifier: form.phone.trim(), password: form.pass }
        : { name: form.name.trim(), phone: form.phone, password: form.pass };
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطایی رخ داد"); setLoading(false); return; }
      // A team member who signed in here almost certainly wants the panel; a
      // customer wants wherever they were headed.
      router.push(data.user?.isStaff ? "/admin" : nextPath);
    } catch {
      setError("خطای شبکه"); setLoading(false);
    }
  };

  const base: React.CSSProperties = {
    width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)",
    color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.88rem",
    padding: "11px 14px", borderRadius: 9, outline: "none",
    boxSizing: "border-box", display: "block", marginBottom: 14,
  };

  // Name input — normal RTL
  const nameInp = () => (
    <input value={form.name} onChange={e => s("name", e.target.value)}
      type="text" placeholder="نام و نام خانوادگی" style={base} />
  );

  // The field is dressed for the mode: an email keyboard and no digit
  // conversion for the team, a phone keypad for a customer. Either way the
  // server reads the value's own shape, so a wrong guess here costs nothing
  // but a keyboard.
  const identifierInp = () => (
    <input
      value={form.phone}
      onChange={e => s("phone", staff ? e.target.value : toLatin(e.target.value))}
      type={staff ? "email" : "tel"}
      inputMode={staff ? "email" : "tel"}
      dir="ltr" lang="en"
      autoComplete={staff ? "email" : "tel"}
      placeholder={staff ? "name@rasamap.ir" : "09123456789"}
      style={{ ...base, textAlign: "left" }}
    />
  );

  // Password input with show/hide toggle + forced Latin
  const passInp = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    show: boolean,
    setShow: (b: boolean) => void,
  ) => (
    <div style={{ position: "relative", marginBottom: 14 }}>
      <input
        value={value}
        onChange={e => onChange(toLatin(e.target.value))}
        type={show ? "text" : "password"}
        dir="ltr" lang="en"
        placeholder={placeholder}
        autoComplete="current-password"
        style={{ ...base, marginBottom: 0, paddingLeft: 42 }}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        tabIndex={-1}
        style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-muted)", display: "flex", alignItems: "center", padding: 4,
          lineHeight: 1,
        }}
      >
        {show ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
    </div>
  );

  // Staff sign-in wears the panel's own colour. The point is not decoration:
  // someone who lands here by a stale link should be able to tell in a glance
  // which door they are standing at.
  const accent = staff ? "#6247C4" : "var(--accent)";
  const glow   = staff ? "rgba(98,71,196,0.45)" : "rgba(59,123,245,0.45)";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", direction: "rtl" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, background: accent, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 900, color: "#fff", boxShadow: `0 0 24px ${glow}`, marginBottom: 10 }}>{staff ? <ShieldCheck size={26} /> : "R"}</div>
          <div className="logo-shimmer" style={{ fontSize: "1.4rem", fontWeight: 800 }}>رسامپ</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 3 }}>
            {staff ? "ورود همکاران — پنل مدیریت رسامپ" : "پلتفرم جامع رسانه‌های محیطی ایران"}
          </div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.4)" }}>
          {/* Staff accounts are created by an administrator, never here, so the
              sign-up tab simply does not exist in that mode. */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
            {(staff ? (["login"] as const) : (["login", "register"] as const)).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(""); }} style={{ flex: 1, padding: "14px", border: "none", background: "none", color: tab === t ? accent : "var(--text-muted)", fontFamily: "inherit", fontSize: "0.88rem", fontWeight: tab === t ? 700 : 400, cursor: "pointer", borderBottom: `2px solid ${tab === t ? accent : "transparent"}`, transition: "all 0.2s" }}>
                {t === "login" ? (staff ? "ورود همکاران" : "ورود") : "ثبت‌نام"}
              </button>
            ))}
          </div>
          <div style={{ padding: "24px" }}>
            {tab === "register" && nameInp()}
            {identifierInp()}
            {passInp(form.pass, v => s("pass", v), "رمز عبور", showPass, setShowPass)}
            {tab === "register" && passInp(form.confirm, v => s("confirm", v), "تکرار رمز", showConfirm, setShowConfirm)}
            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "9px 13px", fontSize: "0.8rem", color: "#ef4444", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> {error}</div>
            )}
            <button onClick={submit} disabled={loading} style={{ width: "100%", background: loading ? "var(--border)" : accent, border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 700, padding: "13px", borderRadius: 9, cursor: loading ? "default" : "pointer", boxShadow: `0 4px 16px ${glow}`, marginBottom: tab === "login" ? 10 : 14 }}>
              {loading ? "در حال پردازش..." : staff ? "ورود به پنل مدیریت" : tab === "login" ? "ورود به حساب" : "ایجاد حساب"}
            </button>
            {tab === "login" && !staff && (
              <div style={{ textAlign: "center" }}>
                <Link href="/reset-password" style={{ color: "var(--text-muted)", fontSize: "0.78rem", textDecoration: "none" }}>رمز عبور را فراموش کرده‌اید؟</Link>
              </div>
            )}
            {staff && (
              <div style={{ textAlign: "center", fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.9 }}>
                بازیابی رمز همکاران از طریق سوپر ادمین انجام می‌شود
              </div>
            )}
          </div>
        </div>
        {/* The switch. It changes the form's clothes, not its rules. */}
        <div style={{ display: "flex", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 4, marginTop: 16, gap: 4 }}>
          {([
            { key: "customer", label: "کاربر", hint: "با شماره موبایل", Icon: User,        color: "var(--accent)" },
            { key: "staff",    label: "همکاران", hint: "با ایمیل سازمانی", Icon: ShieldCheck, color: "#6247C4" },
          ] as const).map(opt => {
            const on = mode === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => switchMode(opt.key)}
                aria-pressed={on}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  background: on ? `${opt.color}1A` : "none",
                  border: `1px solid ${on ? opt.color : "transparent"}`,
                  color: on ? opt.color : "var(--text-muted)",
                  fontFamily: "inherit", padding: "9px 6px", borderRadius: 9,
                  cursor: on ? "default" : "pointer", transition: "all 0.18s",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.83rem", fontWeight: on ? 700 : 500 }}>
                  <opt.Icon size={14} /> {opt.label}
                </span>
                <span style={{ fontSize: "0.66rem", opacity: 0.75 }}>{opt.hint}</span>
              </button>
            );
          })}
        </div>

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <Link href="/" style={{ color: "var(--text-muted)", fontSize: "0.78rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><ArrowRight size={13} /> بازگشت</Link>
        </div>
      </div>
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
