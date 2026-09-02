"use client";
import { useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, AlertTriangle, ArrowRight } from "lucide-react";

// Persian/Arabic digits → Latin digits
const toLatin = (v: string) =>
  v.replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
   .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));

const C = {
  bg:     "var(--bg-deep)",
  card:   "var(--bg-card)",
  border: "var(--border)",
  accent: "var(--accent)",
  text:   "var(--text-main)",
  muted:  "var(--text-muted)",
  red:    "#ef4444",
  font:   "Vazirmatn Variable, Vazirmatn, sans-serif",
};

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const rawNext  = searchParams.get("next") ?? "";
  const nextPath = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/admin";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [locked,   setLocked]   = useState(false);
  const [retryIn,  setRetryIn]  = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);

  const base: React.CSSProperties = {
    width: "100%", background: "var(--bg-surface)",
    border: `1px solid ${error ? C.red : C.border}`,
    color: C.text, fontFamily: C.font, fontSize: "0.88rem",
    padding: "11px 14px", borderRadius: 9, outline: "none",
    boxSizing: "border-box",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || locked) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data: { error?: string; ok?: boolean } = await res.json();

      if (res.status === 429) {
        setLocked(true);
        const retryAfter = parseInt(res.headers.get("Retry-After") ?? "900");
        setRetryIn(retryAfter);
        setError(`تعداد تلاش‌ها بیش از حد مجاز است. ${Math.ceil(retryAfter / 60)} دقیقه صبر کنید.`);
        const iv = setInterval(() => {
          setRetryIn(t => {
            if (t <= 1) { clearInterval(iv); setLocked(false); setError(""); return 0; }
            return t - 1;
          });
        }, 1000);
      } else if (!res.ok) {
        setError(data.error ?? "خطای ناشناخته");
      } else {
        router.push(nextPath);
        router.refresh();
      }
    } catch {
      setError("خطا در ارتباط با سرور. اتصال اینترنت را بررسی کنید.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: C.font, direction: "rtl" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, background: C.accent, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 900, color: "#fff", boxShadow: "0 0 24px rgba(59,123,245,0.4)", marginBottom: 10 }}>R</div>
          <div className="logo-shimmer" style={{ fontSize: "1.4rem", fontWeight: 800 }}>رسامپ</div>
          <div style={{ fontSize: "0.75rem", color: C.muted, marginTop: 3 }}>پنل مدیریت — ورود امن</div>
        </div>

        {/* Card */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.4)" }}>
          <div style={{ background: "rgba(59,123,245,0.06)", borderBottom: `1px solid ${C.border}`, padding: "14px 24px", fontSize: "0.82rem", fontWeight: 700, color: C.accent, display: "flex", alignItems: "center", gap: 7 }}>
            <Lock size={15} /> ورود به پنل مدیریت
          </div>

          <form onSubmit={handleSubmit} style={{ padding: "24px" }}>

            {/* Email — force Latin */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: C.muted, marginBottom: 5 }}>ایمیل</label>
              <input
                ref={emailRef}
                value={email}
                onChange={e => setEmail(toLatin(e.target.value))}
                type="email"
                inputMode="email"
                dir="ltr" lang="en"
                autoComplete="email"
                disabled={loading || locked}
                style={{ ...base, opacity: loading || locked ? 0.6 : 1, textAlign: "left" }}
              />
            </div>

            {/* Password — show/hide + force Latin */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: C.muted, marginBottom: 5 }}>رمز عبور</label>
              <div style={{ position: "relative" }}>
                <input
                  value={password}
                  onChange={e => setPassword(toLatin(e.target.value))}
                  type={showPass ? "text" : "password"}
                  inputMode="url"
                  dir="ltr" lang="en"
                  autoComplete="current-password"
                  disabled={loading || locked}
                  style={{ ...base, paddingLeft: 42, opacity: loading || locked ? 0.6 : 1 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  tabIndex={-1}
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", alignItems: "center", padding: 4, lineHeight: 1 }}
                >
                  {showPass ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 8, padding: "10px 12px", fontSize: "0.78rem", color: C.red, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                {locked ? <><Lock size={13} /> {error} ({retryIn}s)</> : <><AlertTriangle size={13} /> {error}</>}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || locked || !email || !password}
              style={{ width: "100%", background: loading || locked ? "var(--border)" : C.accent, border: "none", color: "#fff", fontFamily: C.font, fontSize: "0.9rem", fontWeight: 700, padding: "13px", borderRadius: 9, cursor: loading || locked ? "not-allowed" : "pointer", boxShadow: "0 4px 16px rgba(59,123,245,0.3)", transition: "all 0.2s", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}
            >
              {loading ? "در حال ورود..." : locked ? <><Lock size={15} /> قفل شده ({retryIn}s)</> : "ورود به سیستم"}
            </button>
          </form>
        </div>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link href="/" style={{ color: C.muted, fontSize: "0.78rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><ArrowRight size={13} /> بازگشت به سایت</Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
