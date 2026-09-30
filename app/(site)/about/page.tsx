import type { Metadata } from "next";
import { Search, Scale, MapPin, Shield, Zap, TrendingUp } from "lucide-react";
import { getCachedSiteStats } from "@/lib/db/cached";
import { logger } from "@/lib/logger";
import { faNum } from "@/lib/format";
import { ButtonLink } from "@/components/ui/Button";
import { cssVar } from "@/components/ui/css-var";
import styles from "../info-pages.module.css";
import reveal from "@/components/ui/reveal.module.css";

export const metadata: Metadata = {
  title: "دربارهٔ رسامپ",
  description: "رسامپ چیست، داده‌هایش از کجا می‌آید، و مدلِ تخمینِ بازدید چطور کار می‌کند.",
};

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
    desc: "مختصات هر رسانه — با یک کلیک موقعیت دقیق را در نشان، بلد یا گوگل‌مپ ببینید.",
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
  // The landing page's figures; a failed read leaves them at zero and logs why.
  let total = 0;
  let cityCount = 0;
  try {
    ({ total, cityCount } = await getCachedSiteStats());
  } catch (err) {
    logger.error("about: site stats unavailable", { error: String(err) });
  }
  return (
    <main id="main">
      <section className={`${styles.hero} section-halo`}>
        <div className={styles.pill}>پروژه دانشگاهی</div>
        <h1 className={styles.heroTitle}>
          بازار تبلیغات محیطی ایران<br />
          <span>دیجیتال می‌شود</span>
        </h1>
        <p className={styles.heroText}>
          رسامپ یک پلتفرم دیجیتال برای جستجو و مقایسهٔ رسانه‌های تبلیغاتی محیطی ایران است —
          بدون تماس تلفنی، بدون واسطه، با قیمت شفاف.
        </p>
        <div className={`${styles.actions} ${styles.center}`}>
          <ButtonLink href="/explore" intent="primary" className={styles.cta}>جستجوی رسانه</ButtonLink>
          <ButtonLink href="/contact" className={styles.cta}>تماس با ما</ButtonLink>
        </div>
      </section>

      <section className={`${styles.band} ${styles.banded} ${styles.story}`}>
        <div className={styles.narrow}>
          <div className={styles.kicker}>داستان رسامپ</div>
          <h2 className={styles.h2}>چرا رسامپ ساخته شد؟</h2>
          <div className={styles.prose}>
            <p>
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

      <section className={styles.band}>
        <div className={styles.stats}>
          {[
            { num: `${faNum(total)}+`, label: "رسانه ثبت‌شده", color: "var(--accent)" },
            { num: `${faNum(cityCount)}+`, label: "شهر پوشش‌داده", color: "var(--green-accent)" },
            { num: "۱۰۰٪", label: "آنلاین و رایگان", color: "var(--accent-warm)" },
          ].map(s => (
            <div key={s.label} className={`${styles.stat} ${reveal.reveal}`} style={cssVar("--tone", s.color)}>
              <strong>{s.num}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.band} ${styles.banded}`}>
        <div className={styles.wide}>
          <div className={styles.sectionHead}>
            <div className={styles.kicker}>چرا رسامپ؟</div>
            <h2 className={styles.h2}>آنچه رسامپ ارائه می‌دهد</h2>
          </div>
          <ul className={styles.grid3}>
            {advantages.map(a => (
              <li key={a.title} className={`${styles.feature} ${reveal.reveal}`}>
                <div className={styles.featureIcon}><a.Icon size={20} /></div>
                <h3 className={styles.featureTitle}>{a.title}</h3>
                <p className={styles.featureText}>{a.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.band}>
        <div className={`${styles.closing} ${reveal.reveal}`}>
          <h2 className={styles.h2}>ارزش‌های ما</h2>
          <p>رسامپ یک پروژه دانشگاهی با اهداف واقعی است. ما به شفافیت، صداقت، و ساده‌سازی فرآیندهای پیچیده اعتقاد داریم.</p>
          <div className={`${styles.actions} ${styles.center}`}>
            <ButtonLink href="/explore" intent="primary" className={styles.cta}>شروع جستجو</ButtonLink>
            <ButtonLink href="/list-media" className={styles.cta}>ثبت رسانه شما</ButtonLink>
          </div>
        </div>
      </section>
    </main>
  );
}
