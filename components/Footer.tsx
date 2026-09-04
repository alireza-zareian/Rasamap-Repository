import Link from "next/link";

const cols = [
  {
    title: "پلتفرم",
    links: [
      ["جستجوی رسانه", "/explore"],
      ["مقایسه رسانه‌ها", "/compare"],
      ["تحلیل بازار", "/analytics"],
    ],
  },
  {
    title: "کاربران",
    links: [
      ["ورود / ثبت‌نام", "/login"],
      ["داشبورد", "/dashboard"],
      ["ثبت رسانه", "/list-media"],
    ],
  },
  {
    title: "شرکت",
    links: [
      ["درباره ما", "/about"],
      ["تماس با ما", "/contact"],
      ["قوانین و مقررات", "/terms"],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="site-footer" style={{
      borderTop: "1px solid var(--border)",
      background: "var(--bg-card)",
      padding: "48px 28px 28px",
      marginTop: 60,
      fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif",
      direction: "rtl",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="footer-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 40, marginBottom: 40 }}>
          {/* Brand */}
          <div>
            <Link href="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, background: "var(--accent)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: "1.05rem" }}>R</div>
              <span className="logo-shimmer" style={{ fontSize: "1.1rem", fontWeight: 800 }}>رسامپ</span>
            </Link>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.8, maxWidth: 220, margin: 0 }}>
              فهرست آنلاین رسانه‌های تبلیغاتی محیطی ایران — جستجو، مقایسه و تماس بدون واسطه
            </p>
            <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
              <a href="https://t.me/rasamap" target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.72rem", padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--text-muted)", textDecoration: "none" }}>تلگرام</a>
              <a href="mailto:info@rasamap.ir" style={{ fontSize: "0.72rem", padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--text-muted)", textDecoration: "none" }}>ایمیل</a>
            </div>
          </div>

          {/* Link columns */}
          {cols.map(col => (
            <div key={col.title}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-main)", marginBottom: 14, letterSpacing: "0.03em" }}>{col.title}</div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} style={{ fontSize: "0.8rem", color: "var(--text-muted)", textDecoration: "none" }}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>© ۱۴۰۵ رسامپ — تمامی حقوق محفوظ است</span>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/terms" style={{ fontSize: "0.72rem", color: "var(--text-muted)", textDecoration: "none" }}>قوانین</Link>
            <Link href="/contact" style={{ fontSize: "0.72rem", color: "var(--text-muted)", textDecoration: "none" }}>تماس</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
