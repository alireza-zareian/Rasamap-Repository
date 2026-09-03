import Link from "next/link";
import { Search, Scale, MapPin, Shield, Zap, TrendingUp } from "lucide-react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import { prisma } from "@/lib/db/client";

const advantages = [
  {
    Icon: Search,
    title: "جستجوی هوشمند",
    desc: "فیلتر بر اساس شهر، نوع، قیمت و ترافیک — بدون تماس تلفنی با آژانس‌های مختلف.",
  },
  {
    Icon: Scale,
    title: "مقایسه شفاف",
    desc: "مشخصات، قیمت و ترافیک رسانه‌ها را کنار هم ببینید و بهترین تصمیم را بگیرید.",
  },
  {
    Icon: MapPin,
    title: "موقعیت دقیق",
    desc: "مختصات GPS هر رسانه — با یک کلیک موقعیت دقیق را در Google Maps ببینید.",
  },
  {
    Icon: Shield,
    title: "اطلاعات معتبر",
    desc: "داده‌ها از منابع واقعی بازار جمع‌آوری و بروزرسانی می‌شوند.",
  },
  {
    Icon: Zap,
    title: "تماس مستقیم",
    desc: "شمارهٔ صاحب رسانه در دسترس است — بدون واسطه و بدون کاغذبازی.",
  },
  {
    Icon: TrendingUp,
    title: "تحلیل بازار",
    desc: "میانگین قیمت‌ها، پرطرفدارترین مناطق و ترندهای بازار رسانه‌های محیطی.",
  },
];

export default async function AboutPage() {
  let total = 0;
  let cityCount = 0;
  try {
    [total, cityCount] = await Promise.all([
      prisma.billboard.count({ where: { status: { not: "pending" } } }),
      prisma.billboard.groupBy({ by: ["city"], where: { status: { not: "pending" } } }).then(r => r.length),
    ]);
  } catch {
    // DB unavailable — render with fallback values
  }
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", direction: "rtl", color: "var(--text-main)" }}>
      <Topbar />

      {/* Hero */}
      <section className="section-halo" style={{ maxWidth: 800, margin: "0 auto", padding: "100px 24px 60px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(59,123,245,0.1)", border: "1px solid rgba(59,123,245,0.25)", borderRadius: 99, padding: "5px 16px", fontSize: "0.72rem", color: "var(--accent)", fontWeight: 700, marginBottom: 24 }}>
          پروژه دانشگاهی
        </div>
        <h1 style={{ fontSize: "2.4rem", fontWeight: 900, marginBottom: 20, lineHeight: 1.3 }}>
          بازار تبلیغات محیطی ایران<br />
          <span style={{ color: "var(--accent)" }}>دیجیتال می‌شود</span>
        </h1>
        <p style={{ fontSize: "1rem", color: "var(--text-muted)", lineHeight: 1.9, fontWeight: 300, maxWidth: 560, margin: "0 auto 32px" }}>
          رسامپ یک پلتفرم دیجیتال برای جستجو و مقایسهٔ رسانه‌های تبلیغاتی محیطی ایران است —
          بدون تماس تلفنی، بدون واسطه، با قیمت شفاف.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/explore" style={{ background: "var(--accent)", color: "#fff", textDecoration: "none", padding: "12px 28px", borderRadius: 9, fontWeight: 700, fontSize: "0.9rem", boxShadow: "0 4px 16px rgba(59,123,245,0.3)" }}>جستجوی رسانه</Link>
          <Link href="/contact" style={{ border: "1px solid var(--border)", color: "var(--text-main)", textDecoration: "none", padding: "12px 28px", borderRadius: 9, fontSize: "0.9rem" }}>تماس با ما</Link>
        </div>
      </section>

      {/* Story */}
      <section style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--bg-card)", padding: "60px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 700, letterSpacing: 2, marginBottom: 16 }}>داستان رسامپ</div>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: 20 }}>چرا رسامپ ساخته شد؟</h2>
          <div style={{ fontSize: "0.92rem", color: "var(--text-muted)", lineHeight: 2, fontWeight: 300 }}>
            <p style={{ marginBottom: 16 }}>
              بازار رسانه‌های محیطی ایران — بیلبورد، تلویزیون شهری، عرشه پل و ایستگاه — همیشه مبهم بوده.
              کسب‌وکارها مجبور بودند با ده‌ها آژانس تماس بگیرند، هفته‌ها صبر کنند، و بدون مقایسه واقعی تصمیم بگیرند.
            </p>
            <p>
              رسامپ این فرآیند را به چند دقیقه تقلیل می‌دهد. داده‌های واقعی از بازار جمع‌آوری شده،
              یک موتور جستجو و مقایسه ساخته شده تا صاحبان رسانه و تبلیغ‌دهندگان یکدیگر را پیدا کنند.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ padding: "60px 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div className="about-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, textAlign: "center" }}>
            {[
              { num: `${total.toLocaleString("fa-IR")}+`, label: "رسانه ثبت‌شده", color: "var(--accent)" },
              { num: `${cityCount.toLocaleString("fa-IR")}+`, label: "شهر پوشش‌داده", color: "var(--green-accent)" },
              { num: "۱۰۰٪", label: "آنلاین و رایگان", color: "var(--accent-warm)" },
            ].map(s => (
              <div key={s.label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "28px 16px" }}>
                <div style={{ fontSize: "2rem", fontWeight: 900, color: s.color, marginBottom: 8 }}>{s.num}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Advantages */}
      <section style={{ padding: "60px 24px", borderTop: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>چرا رسامپ؟</div>
            <h2 style={{ fontSize: "1.7rem", fontWeight: 800 }}>آنچه رسامپ ارائه می‌دهد</h2>
          </div>
          <div className="how-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {advantages.map(a => (
              <div key={a.title} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "24px 20px" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(59,123,245,0.1)", border: "1px solid rgba(59,123,245,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", marginBottom: 14 }}>
                  <a.Icon size={20} />
                </div>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: "0.92rem" }}>{a.title}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.8, fontWeight: 300 }}>{a.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section style={{ padding: "60px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: 16 }}>ارزش‌های ما</h2>
          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.9, fontWeight: 300, marginBottom: 36 }}>
            رسامپ یک پروژه دانشگاهی با اهداف واقعی است. ما به شفافیت، صداقت، و ساده‌سازی فرآیندهای پیچیده اعتقاد داریم.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Link href="/explore" style={{ background: "var(--accent)", color: "#fff", textDecoration: "none", padding: "12px 28px", borderRadius: 9, fontWeight: 700, fontSize: "0.9rem" }}>شروع جستجو</Link>
            <Link href="/list-media" style={{ border: "1px solid var(--border)", color: "var(--text-main)", textDecoration: "none", padding: "12px 28px", borderRadius: 9, fontSize: "0.9rem" }}>ثبت رسانه شما</Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
