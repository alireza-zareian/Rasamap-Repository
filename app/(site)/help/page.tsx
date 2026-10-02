import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { faNum } from "@/lib/format";
import { MAX_PICKED } from "@/lib/domain/campaign";
import { MAX_LISTING_IMAGES } from "@/lib/domain/listing";
import { PLANS } from "@/components/listing/plans";
import styles from "../info-pages.module.css";

export const metadata: Metadata = {
  title: "راهنما و پرسش‌های پرتکرار | رسامپ",
  description: "رسامپ چطور کار می‌کند: پیدا کردن رسانه، تماس با صاحب آن، طرح کمپین، ثبت رسانه، پلن‌ها و تأیید پرداخت.",
  alternates: { canonical: "/help" },
};

const [free, featured] = PLANS;

/**
 * The questions a first visit raises, each answered from the rule the code
 * enforces — the limits are read from lib/domain and the plans from the copy
 * the listing form shows, so an answer cannot quote a number the site has
 * since changed. Native <details>: no script, find-in-page opens them.
 */
const GROUPS: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: "برای تبلیغ‌دهنده",
    items: [
      {
        q: "رسامپ چه کاری انجام می‌دهد؟",
        a: "رسامپ فهرست آنلاین رسانه‌های تبلیغات محیطی ایران است: بیلبورد، تلویزیون شهری، عرشهٔ پل و ایستگاه. رسانه‌ها متعلق به رسامپ نیستند؛ شما رسانه را پیدا می‌کنید و با صاحبش مستقیم توافق می‌کنید.",
      },
      {
        q: "استفاده از رسامپ برای من هزینه دارد؟",
        a: "نه. جستجو، ذخیره، طرح کمپین و دیدن شمارهٔ صاحب رسانه رایگان است. درآمد رسامپ از پلن ویژه‌ای است که صاحبان رسانه برای آگهی خود انتخاب می‌کنند.",
      },
      {
        q: "شمارهٔ صاحب رسانه را از کجا ببینم؟",
        a: "وارد حساب کاربری شوید و در صفحهٔ رسانه «نمایش شمارهٔ تماس» را بزنید. هر درخواست برای پیگیری تیم رسامپ ثبت می‌شود و به صاحب رسانه یا شخص دیگری داده نمی‌شود.",
      },
      {
        q: "قیمت‌ها قطعی هستند؟",
        a: "قیمتی که صاحب رسانه خودش ثبت کرده همان است که اعلام کرده. کنار قیمت رسانه‌هایی که از سایت دیگری آمده‌اند «تقریبی» نوشته شده: قیمت منبع یا برآورد است و رقم قطعی را باید از صاحب رسانه پرسید.",
      },
      {
        q: "«استعلام از مالک» یعنی چه؟",
        a: "منبع این رسانه اعلام نکرده که الان خالی است یا نه. پیش از برنامه‌ریزی، وضعیت را از صاحب رسانه بپرسید؛ رسامپ آن را به حدس «خالی» نشان نمی‌دهد.",
      },
      {
        q: "طرح کمپین چیست؟",
        a: `با دکمهٔ «+ کمپین» تا ${faNum(MAX_PICKED)} رسانه را کنار هم بگذارید و برای یک دوره (هفته، ماه، سه‌ماه یا سال) هزینهٔ کل، بینندهٔ روزانه، هزینهٔ هر هزار نمایش و جای آن‌ها روی نقشه را یکجا ببینید. طرح لینک اشتراکی دارد و چاپ می‌شود.`,
      },
      {
        q: "عدد بازدید هر رسانه از کجا می‌آید؟",
        a: "تخمینی است، نه شمارش: تعداد وسایل نقلیه × ۱٫۴ سرنشین × ۴۰٪ نرخ توجه، به‌اضافهٔ عابران × ۶۰٪، بر پایهٔ جمعیت شهر، نوع رسانه و موقعیت آن. برای مقایسهٔ رسانه‌ها با هم مفید است؛ دادهٔ واقعی ممکن است متفاوت باشد.",
      },
    ],
  },
  {
    title: "برای صاحب رسانه",
    items: [
      {
        q: "چطور رسانه‌ام را ثبت کنم؟",
        a: `حساب کاربری بسازید و فرم «ثبت رسانه» را پر کنید: مشخصات، موقعیت، قیمت، تا ${faNum(MAX_LISTING_IMAGES)} عکس و انتخاب پلن. آگهی پیش از انتشار توسط کارشناس رسامپ بررسی می‌شود و وضعیتش را در داشبورد می‌بینید.`,
      },
      {
        q: "پلن‌ها چه فرقی دارند؟",
        a: `پلن ${free.title} (${free.price}): ${free.perks.join("، ")}. پلن ${featured.title} (${featured.price}): ${featured.perks.join("، ")}.`,
      },
      {
        q: "هزینهٔ پلن ویژه را چطور بپردازم؟",
        a: "پرداخت آنلاین فعال نیست. آگهی با پلن ویژه پس از ثبت در وضعیت «در انتظار پرداخت» می‌ماند و شمارهٔ کارت از طریق پشتیبانی اعلام می‌شود. با تأیید واریز توسط ادمین، آگهی منتشر می‌شود و نشان «ویژه» می‌گیرد.",
      },
      {
        q: "اگر آگهی‌ام رد شود یا اصلاح بخواهد؟",
        a: "توضیح کارشناس زیر همان آگهی در داشبورد نوشته می‌شود. آگهیِ «نیاز به اصلاح» را همان‌جا ویرایش کنید و دوباره بفرستید تا دوباره بررسی شود.",
      },
    ],
  },
  {
    title: "حساب کاربری",
    items: [
      {
        q: "رمز عبورم را فراموش کرده‌ام",
        a: "در صفحهٔ ورود «رمز عبور را فراموش کرده‌اید؟» را بزنید. یک کد شش‌رقمی به شمارهٔ موبایلتان فرستاده می‌شود که پنج دقیقه اعتبار دارد؛ با آن رمز تازه بگذارید.",
      },
      {
        q: "رسانه‌هایی که ذخیره کرده‌ام کجا هستند؟",
        a: "در «ذخیره‌شده‌ها». فهرست به حسابتان بسته است، پس روی هر دستگاهی که وارد شوید همراهتان است.",
      },
    ],
  },
];

/** The same questions as FAQPage structured data, for a search result to show. */
function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: GROUPS.flatMap(g => g.items).map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

export default function HelpPage() {
  return (
    <main id="main" className={styles.page}>
      {/* "<" escaped, as on the media page: no answer can end the tag. */}
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()).replace(/</g, "\\u003c") }} />
      <div className={styles.narrow}>
        <h1 className={styles.h1}>راهنما و پرسش‌های پرتکرار</h1>
        <div className={styles.rule} />
        <p className={styles.lede}>رسامپ چطور کار می‌کند — برای کسی که رسانه می‌خواهد و کسی که رسانه دارد.</p>

        {GROUPS.map(g => (
          <section key={g.title} className={styles.faqGroup}>
            <h2 className={styles.faqTitle}>{g.title}</h2>
            <div className={styles.stack}>
              {g.items.map(({ q, a }) => (
                <details key={q} className={`${styles.card} ${styles.faq}`}>
                  <summary>{q}</summary>
                  <p className={styles.cardText}>{a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}

        <div className={`${styles.card} ${styles.ask}`}>
          <Mail size={20} />
          <div>
            <strong>جوابتان را پیدا نکردید؟</strong>
            <span>از صفحهٔ <Link href="/contact" className={styles.link}>تماس با ما</Link> بپرسید؛ قوانین کامل در <Link href="/terms" className={styles.link}>قوانین و مقررات</Link> است.</span>
          </div>
        </div>
      </div>
    </main>
  );
}
