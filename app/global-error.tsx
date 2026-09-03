"use client";
import { useEffect } from "react";

/**
 * Last-resort error boundary: this one catches a failure in the root layout
 * itself, which app/error.tsx cannot — error.tsx is rendered *inside* the
 * layout, so if the layout throws there is nothing left to wrap it.
 *
 * Because it replaces the root layout it has to supply its own <html>/<body>,
 * and it cannot rely on globals.css or the Vazirmatn import having loaded:
 * whatever broke the layout may have broken those too. So every colour here is
 * a literal, the font stack falls back to the system, and nothing is imported
 * beyond React. Without this file the user would see Next.js's default English
 * error screen (§5: never a blank screen, never a raw trace).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("global error boundary", error); }, [error]);

  return (
    <html lang="fa" dir="rtl">
      <body style={{ margin: 0 }}>
        <title>خطای غیرمنتظره | رسامپ</title>
        <div style={{ minHeight: "100vh", background: "#0A0E1A", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Vazirmatn Variable, Vazirmatn, system-ui, sans-serif", direction: "rtl", color: "#E6EAF3", padding: 20 }}>
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, color: "#F5A623" }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4" /><path d="M12 17h.01" />
              </svg>
            </div>
            <h1 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 8 }}>خطای غیرمنتظره</h1>
            <p style={{ fontSize: "0.85rem", color: "#94A3B8", marginBottom: error.digest ? 12 : 28, lineHeight: 1.9 }}>
              سایت در بارگذاری این صفحه به مشکل خورد. لطفاً دوباره تلاش کنید؛ اگر باز هم تکرار شد، کد زیر را به پشتیبانی بدهید.
            </p>
            {error.digest && (
              <p style={{ fontSize: "0.72rem", color: "#94A3B8", marginBottom: 28, fontFamily: "monospace", direction: "ltr" }}>
                کد خطا: {error.digest}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={reset} style={{ background: "#3B7BF5", border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.88rem", fontWeight: 700, padding: "11px 24px", borderRadius: 9, cursor: "pointer" }}>
                تلاش مجدد
              </button>
              {/* A plain <a>, not <Link>: a client-side navigation would re-mount
                  the very layout that just crashed. A full page load is the
                  point — it is the only way out of a broken root. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" style={{ background: "none", border: "1px solid #22304A", color: "#94A3B8", fontFamily: "inherit", fontSize: "0.88rem", padding: "11px 24px", borderRadius: 9, textDecoration: "none", display: "inline-block" }}>
                صفحه اصلی
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
