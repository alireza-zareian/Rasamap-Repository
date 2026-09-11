import Link from "next/link";
import { ShieldOff } from "lucide-react";

export const metadata = {
  title: "دسترسی مجاز نیست | رسامپ",
  // Nothing here is worth indexing, and the address only appears after a
  // refusal — so keep it out of search results entirely.
  robots: { index: false, follow: false },
};

/**
 * "You are signed in, but not as someone who may see this."
 *
 * Before this page existed, proxy.ts answered that case by redirecting to the
 * sign-in form. For a signed-out visitor that is right. For a customer who
 * followed a link to /admin it was actively misleading: they *were* signed in,
 * so being shown a sign-in form suggested their session had failed and left
 * them typing a password that was never the problem.
 *
 * §5 asks for a designed Persian page per status code, and 403 was the one
 * missing. It deliberately does not say what lives at the address it refused.
 */
export default function ForbiddenPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", direction: "rtl", color: "var(--text-main)", padding: 20 }}>
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14, color: "var(--accent)" }}>
          <ShieldOff size={52} strokeWidth={1.4} />
        </div>
        <div style={{ fontSize: "4rem", fontWeight: 900, color: "var(--accent)", lineHeight: 1, marginBottom: 12, letterSpacing: "-0.04em" }}>۴۰۳</div>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 8 }}>دسترسی به این بخش ندارید</h1>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 28, lineHeight: 1.9 }}>
          شما وارد حساب خود شده‌اید، ولی این بخش برای کارکنان است.
          اگر فکر می‌کنید اشتباهی رخ داده، با پشتیبانی تماس بگیرید.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/dashboard" style={{ background: "var(--accent)", color: "#fff", fontFamily: "inherit", fontSize: "0.88rem", fontWeight: 700, padding: "11px 28px", borderRadius: 9, textDecoration: "none", display: "inline-block" }}>
            داشبورد من
          </Link>
          <Link href="/" style={{ border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.88rem", padding: "11px 28px", borderRadius: 9, textDecoration: "none", display: "inline-block" }}>
            بازگشت به خانه
          </Link>
        </div>
      </div>
    </div>
  );
}
