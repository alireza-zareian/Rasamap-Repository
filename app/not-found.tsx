import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Vazirmatn,sans-serif", direction: "rtl", color: "var(--text-main)", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: "4rem", fontWeight: 900, color: "var(--accent)", lineHeight: 1, marginBottom: 12, letterSpacing: "-0.04em" }}>404</div>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 8 }}>صفحه یافت نشد</h1>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 28, lineHeight: 1.7 }}>
          صفحه‌ای که دنبالش می‌گردید وجود ندارد یا جابه‌جا شده است.
        </p>
        <Link href="/" style={{ background: "var(--accent)", color: "#fff", fontFamily: "inherit", fontSize: "0.88rem", fontWeight: 700, padding: "11px 28px", borderRadius: 9, textDecoration: "none", display: "inline-block" }}>
          بازگشت به خانه
        </Link>
      </div>
    </div>
  );
}
