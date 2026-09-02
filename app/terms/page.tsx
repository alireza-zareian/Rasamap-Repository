import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Mail } from "lucide-react";

const sections = [
  { title: "۱. پذیرش شرایط", body: "با استفاده از پلتفرم رسامپ، کاربر تمامی شرایط و قوانین مندرج در این سند را می‌پذیرد. استفاده از خدمات به معنای موافقت با این شرایط است." },
  { title: "۲. خدمات ارائه‌شده", body: "رسامپ یک بازار آنلاین برای رزرو رسانه‌های تبلیغاتی محیطی است. ما تسهیل‌گر ارتباط بین تبلیغ‌دهندگان و صاحبان رسانه‌ها هستیم و مسئولیت مستقیم رسانه‌ها را بر عهده نداریم." },
  { title: "۳. ثبت‌نام و حساب کاربری", body: "اطلاعات ارائه‌شده هنگام ثبت‌نام باید صحیح و کامل باشد. کاربر مسئول حفظ امنیت رمز عبور خود است. رسامپ حق دارد در صورت نقض قوانین، حساب را تعلیق یا حذف کند." },
  { title: "۴. رزرو و پرداخت", body: "رزرو رسانه پس از تأیید توسط تیم رسامپ نهایی می‌شود. پرداخت‌ها باید از طریق درگاه‌های مورد تأیید انجام شود. لغو رزرو تابع سیاست لغو هر رسانه است که در زمان رزرو اعلام می‌شود." },
  { title: "۵. محتوای تبلیغاتی", body: "محتوای تبلیغاتی باید با قوانین جمهوری اسلامی ایران مطابقت داشته باشد. محتوای غیراخلاقی، سیاسی مغایر با قوانین، یا گمراه‌کننده پذیرفته نمی‌شود. رسامپ حق رد درخواست‌های مغایر با این بند را دارد." },
  { title: "۶. حریم خصوصی", body: "اطلاعات شخصی کاربران تنها برای ارائه خدمات استفاده می‌شود و به اشخاص ثالث فروخته نمی‌شود. با استفاده از سرویس، کاربر با سیاست حریم خصوصی رسامپ موافقت می‌کند." },
  { title: "۷. محدودیت مسئولیت", body: "رسامپ پلتفرمی دانشگاهی-تجربی است. ما تلاش می‌کنیم اطلاعات دقیق ارائه دهیم اما ضمانت کامل صحت اطلاعات رسانه‌ها را نمی‌دهیم. کاربر باید پیش از رزرو، اطلاعات را راستی‌آزمایی کند." },
  { title: "۸. تغییر شرایط", body: "رسامپ حق دارد این شرایط را در هر زمان بدون اطلاع قبلی تغییر دهد. ادامه استفاده از سرویس پس از تغییرات، به منزله پذیرش شرایط جدید است." },
];

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", direction: "rtl", color: "var(--text-main)" }}>
      <Topbar />

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "96px 20px 40px" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 900, marginBottom: 8 }}>قوانین و مقررات</h1>
        <div style={{ width: 48, height: 4, background: "var(--accent)", borderRadius: 2, marginBottom: 12 }} />
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 36 }}>آخرین به‌روزرسانی: شهریور ۱۴۰۵</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {sections.map(s => (
            <div key={s.title} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ fontWeight: 700, marginBottom: 10, fontSize: "0.93rem" }}>{s.title}</div>
              <div style={{ fontSize: "0.85rem", lineHeight: 1.9, color: "var(--text-muted)" }}>{s.body}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 22px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", color: "var(--accent)" }}><Mail size={20} /></div>
          <div>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 3 }}>سوال دارید؟</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>برای هرگونه سوال درباره قوانین، با ما در <Link href="/contact" style={{ color: "var(--accent)", textDecoration: "none" }}>تماس</Link> باشید.</div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
