import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import { Mail, Send, Building2, Clock } from "lucide-react";

const contacts = [
  {
    Icon: Mail,
    label: "ایمیل",
    val: "info@rasamap.ir",
    sub: "پاسخ‌دهی در ۲۴ ساعت",
    href: "mailto:info@rasamap.ir",
  },
  {
    Icon: Send,
    label: "تلگرام",
    val: "@rasamap",
    sub: "پشتیبانی آنلاین",
    href: "https://t.me/rasamap",
  },
  {
    Icon: Building2,
    label: "دفتر مرکزی",
    val: "تهران، ایران",
    sub: "پروژه دانشگاهی",
    href: null,
  },
  {
    Icon: Clock,
    label: "ساعت پاسخ‌گویی",
    val: "شنبه تا چهارشنبه",
    sub: "۹ صبح تا ۶ عصر",
    href: null,
  },
];

export default function ContactPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", direction: "rtl", color: "var(--text-main)" }}>
      <Topbar />

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "96px 20px 40px" }}>
        <div className="section-halo">
          <h1 style={{ fontSize: "2rem", fontWeight: 900, marginBottom: 8 }}>تماس با ما</h1>
          <div style={{ width: 48, height: 4, background: "var(--accent)", borderRadius: 2, marginBottom: 16 }} />
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 40, lineHeight: 1.8 }}>
            رسامپ یک پروژه دانشگاهی است. برای سوال، پیشنهاد، یا همکاری از کانال‌های زیر تماس بگیرید.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 40 }}>
          {contacts.map(c => (
            <div key={c.label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px" }}>
              <c.Icon size={22} style={{ color: "var(--accent)", marginBottom: 10 }} />
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 4 }}>{c.label}</div>
              {c.href ? (
                <a href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
                  style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}>
                  {c.val}
                </a>
              ) : (
                <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>{c.val}</div>
              )}
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 4 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 28 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: "0.95rem" }}>تماس مستقیم</div>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.9, margin: "0 0 20px" }}>
            برای ارسال پیام می‌توانید مستقیماً از طریق ایمیل یا تلگرام با ما در ارتباط باشید.
            در اسرع وقت پاسخ می‌دهیم.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="mailto:info@rasamap.ir"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--accent)", color: "#fff", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", fontWeight: 700, fontSize: "0.85rem", padding: "10px 20px", borderRadius: 9, textDecoration: "none" }}>
              <Mail size={15} />
              ارسال ایمیل
            </a>
            <a href="https://t.me/rasamap" target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--bg-surface)", color: "var(--text-main)", border: "1px solid var(--border)", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", fontWeight: 600, fontSize: "0.85rem", padding: "10px 20px", borderRadius: 9, textDecoration: "none" }}>
              <Send size={15} />
              تلگرام
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
