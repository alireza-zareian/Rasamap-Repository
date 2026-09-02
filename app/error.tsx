"use client";
import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", direction: "rtl", color: "var(--text-main)", padding: 20 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, color: "var(--accent-warm)" }}><TriangleAlert size={56} strokeWidth={1.5} /></div>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 8 }}>خطایی رخ داد</h1>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: error.digest ? 12 : 28, lineHeight: 1.7 }}>
          مشکلی در بارگذاری این صفحه پیش آمد. لطفاً دوباره امتحان کنید.
        </p>
        {error.digest && (
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 28, fontFamily: "monospace", direction: "ltr" }}>
            کد خطا: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={reset} style={{ background: "var(--accent)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.88rem", fontWeight: 700, padding: "11px 24px", borderRadius: 9, cursor: "pointer" }}>
            تلاش مجدد
          </button>
          <Link href="/" style={{ background: "none", border: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "inherit", fontSize: "0.88rem", padding: "11px 24px", borderRadius: 9, textDecoration: "none", display: "inline-block" }}>
            صفحه اصلی
          </Link>
        </div>
      </div>
    </div>
  );
}
