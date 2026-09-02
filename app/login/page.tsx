"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, AlertTriangle, ArrowRight } from "lucide-react";

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

  const [tab, setTab] = useState<"login"|"register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ phone: "", pass: "", name: "", confirm: "" });
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const s = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

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
      const body = tab === "login"
        ? { phone: form.phone, password: form.pass }
        : { name: form.name.trim(), phone: form.phone, password: form.pass };
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطایی رخ داد"); setLoading(false); return; }
      router.push(nextPath);
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

  // Phone input — force Latin keyboard, convert Persian digits
  const phoneInp = () => (
    <input
      value={form.phone}
      onChange={e => s("phone", toLatin(e.target.value))}
      type="tel" inputMode="tel" dir="ltr" lang="en"
      placeholder="09123456789"
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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", direction: "rtl" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, background: "var(--accent)", borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 900, color: "#fff", boxShadow: "0 0 24px rgba(59,123,245,0.45)", marginBottom: 10 }}>R</div>
          <div className="logo-shimmer" style={{ fontSize: "1.4rem", fontWeight: 800 }}>رسامپ</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 3 }}>پلتفرم جامع رسانه‌های محیطی ایران</div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.4)" }}>
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
            {(["login", "register"] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(""); }} style={{ flex: 1, padding: "14px", border: "none", background: "none", color: tab === t ? "var(--accent)" : "var(--text-muted)", fontFamily: "inherit", fontSize: "0.88rem", fontWeight: tab === t ? 700 : 400, cursor: "pointer", borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`, transition: "all 0.2s" }}>
                {t === "login" ? "ورود" : "ثبت‌نام"}
              </button>
            ))}
          </div>
          <div style={{ padding: "24px" }}>
            {tab === "register" && nameInp()}
            {phoneInp()}
            {passInp(form.pass, v => s("pass", v), "رمز عبور", showPass, setShowPass)}
            {tab === "register" && passInp(form.confirm, v => s("confirm", v), "تکرار رمز", showConfirm, setShowConfirm)}
            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "9px 13px", fontSize: "0.8rem", color: "#ef4444", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> {error}</div>
            )}
            <button onClick={submit} disabled={loading} style={{ width: "100%", background: loading ? "var(--border)" : "var(--accent)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 700, padding: "13px", borderRadius: 9, cursor: loading ? "default" : "pointer", boxShadow: "0 4px 16px rgba(59,123,245,0.3)", marginBottom: tab === "login" ? 10 : 14 }}>
              {loading ? "در حال پردازش..." : tab === "login" ? "ورود به حساب" : "ایجاد حساب"}
            </button>
            {tab === "login" && (
              <div style={{ textAlign: "center" }}>
                <Link href="/reset-password" style={{ color: "var(--text-muted)", fontSize: "0.78rem", textDecoration: "none" }}>رمز عبور را فراموش کرده‌اید؟</Link>
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 16 }}>
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
