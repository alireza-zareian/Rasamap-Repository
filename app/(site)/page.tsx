import Link from "next/link";
import { Megaphone, Eye, Building2, CheckCircle2, Search, Scale, Phone, Monitor, Milestone, Train, Map } from "lucide-react";
import { getCachedSiteStats, getCachedShowcaseBillboards } from "@/lib/db/cached";
import type { BillboardType } from "@/lib/types";
import { faNum } from "@/lib/format";
import { ButtonLink } from "@/components/ui/Button";
import SwipeMarquee from "@/components/SwipeMarquee";
import LandingSearch from "./_landing/LandingSearch";
import FeaturedCarousel from "./_landing/FeaturedCarousel";
import { cssVar } from "@/components/ui/css-var";
import styles from "./_landing/landing.module.css";
import reveal from "@/components/ui/reveal.module.css";

/**
 * The landing page — a Server Component. Its statistics and featured media are
 * read from the same cached queries the catalogue uses and are in the HTML.
 * The markup is rendered here; only the two things that need a browser — the
 * search box and the auto-advancing carousel — are client components. It used
 * to be one 400-line client component with its own copy of the header and the
 * footer.
 */

/** Cards in the featured gallery. */
const GALLERY_CARDS = 12;

const HEADLINE_TYPES = [
  { label: "بیلبورد",        type: "billboard", color: "#3B7BF5" },
  { label: "تلویزیون شهری",  type: "digital",   color: "#00D17A" },
  { label: "عرشه پل",        type: "bridge",    color: "#F5823B" },
  { label: "ایستگاه مترو",   type: "station",   color: "#a855f7" },
] as const;

const QUICK_SEARCHES = ["همت غرب", "ونک", "ولیعصر", "آزادی", "تجریش", "صادقیه"];

const TYPES: { type: BillboardType; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { type: "billboard", label: "بیلبورد", Icon: Megaphone },
  { type: "digital", label: "دیجیتال / LED", Icon: Monitor },
  { type: "bridge", label: "عرشه پل", Icon: Milestone },
  { type: "station", label: "ایستگاه / مترو", Icon: Train },
];

const STEPS = [
  { Icon: Search, title: "جستجو کن", text: "شهر، منطقه، بودجه و نوع رسانه‌ات رو انتخاب کن" },
  { Icon: Scale, title: "مقایسه کن", text: "چند رسانه رو کنار هم بذار و بر اساس بازدید و قیمت تصمیم بگیر" },
  { Icon: Phone, title: "تماس بگیر", text: "شمارهٔ صاحب رسانه را بگیر و مستقیم توافق کن — بدون واسطه" },
];

const TESTIMONIALS = [
  { name: "علی رضایی", company: "آژانس تبلیغاتی آرتا", color: "#3B7BF5", text: "با رسامپ توانستم در کمتر از ۱۰ دقیقه بیلبوردهای خیابان ولیعصر رو مقایسه کنم و بهترین قیمت رو پیدا کنم. دیگه نیازی به تماس تلفنی نیست." },
  { name: "مریم کریمی", company: "برند پوشاک کاج", color: "#00D17A", text: "رسامپ کارمون رو خیلی آسون کرد. موقعیت دقیق هر بیلبورد رو می‌بینیم و تراکم رقبا رو بررسی می‌کنیم قبل از تماس." },
  { name: "حسین موسوی", company: "شرکت داروسازی پارسیان", color: "#9B72F5", text: "قیمت‌گذاری شفاف رسامپ باورنکردنیه. می‌دونیم دقیقاً چقدر باید بپردازیم — بدون مذاکره، بدون سورپرایز." },
];

const BRANDS = ["دیجی‌کالا", "اسنپ‌فود", "آپارات", "همراه اول", "ایرانسل"];

/** A billboard skyline drawn behind the hero: a grid and a few boards on poles. */
function HeroArt() {
  const boards = [[120, 200], [400, 100], [700, 250], [950, 150], [1200, 200], [250, 500], [600, 480], [850, 520], [1100, 460]];
  return (
    <svg className={styles.heroGrid} viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 80} x2="1400" y2={i * 80} stroke="#3B7BF5" strokeWidth="0.5" />)}
      {Array.from({ length: 18 }, (_, i) => <line key={`v${i}`} x1={i * 80} y1="0" x2={i * 80} y2="900" stroke="#3B7BF5" strokeWidth="0.5" />)}
      {boards.map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width="80" height="50" rx="4" fill="none" stroke="#3B7BF5" strokeWidth="1" opacity="0.6" />
          <rect x={x + 5} y={y + 5} width="70" height="40" rx="2" fill="#3B7BF5" opacity="0.08" />
          <line x1={x + 40} y1={y + 50} x2={x + 40} y2={y + 90} stroke="#3B7BF5" strokeWidth="2" opacity="0.4" />
        </g>
      ))}
    </svg>
  );
}

export default async function LandingPage() {
  const [stats, featured] = await Promise.all([
    getCachedSiteStats(),
    getCachedShowcaseBillboards(GALLERY_CARDS),
  ]);
  const cities = Object.entries(stats.byCity).sort((a, b) => b[1] - a[1]);

  const figures = [
    { num: faNum(stats.total) + "+", label: "رسانه ثبت‌شده", Icon: Megaphone, tone: "var(--accent)" },
    { num: faNum(Math.round(stats.totalDailyReach / 1_000_000)) + "M+", label: "تردد روزانه بازار", Icon: Eye, tone: "var(--green-accent)" },
    { num: faNum(stats.cityCount), label: "شهر پوشش‌داده", Icon: Building2, tone: "var(--accent-warm)" },
    { num: "۱۰۰٪", label: "آنلاین و بدون تماس", Icon: CheckCircle2, tone: "var(--green-accent)" },
  ];

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBg}><HeroArt /></div>
        <div className={styles.heroGlow} />
        <div className={styles.heroInner}>
          <h1 className={styles.headline}>
            <span className={`${styles.headlineText} shimmer-heading`}>رسانه‌ات رو پیدا کن</span>
            <span className={styles.dash} aria-hidden="true">—</span>
            {HEADLINE_TYPES.map(item => (
              <Link key={item.type} href={`/explore?type=${item.type}`} title={`دیدن همهٔ ${item.label}‌ها`}
                className={styles.typeChip} style={cssVar("--chip", item.color)}>{item.label}</Link>
            ))}
            <span className={styles.tagline}>— آنلاین، بدون واسطه</span>
          </h1>

          <LandingSearch cities={cities} />

          <div className={styles.quickChips}>
            {QUICK_SEARCHES.map(q => <Link key={q} href={`/explore?search=${encodeURIComponent(q)}`}>{q}</Link>)}
          </div>

          {featured.length > 0 && (
            <div className={styles.ticker}>
              <span className={styles.live}><span className={styles.liveDot} /> زنده</span>
              <SwipeMarquee className={`${styles.tickerWindow} ticker-window`}>
                <div className={`${styles.tickerStrip} ticker-strip`}>
                  {[...featured, ...featured].map((b, i) => (
                    <Link key={i} href={`/billboard/${b.slug}`} className={styles.tickerItem} tabIndex={i >= featured.length ? -1 : undefined}>
                      <span className={styles.tickerPrice}>{faNum(b.price)}M</span>
                      {b.name.substring(0, 22)}
                      <span className={styles.tickerSep}>·</span>
                    </Link>
                  ))}
                </div>
              </SwipeMarquee>
            </div>
          )}
        </div>
      </section>

      {/* Left out entirely if nothing in the catalogue has a photograph. */}
      {featured.length > 0 && (
        <section className={styles.featured}>
          <div className={styles.featuredInner}>
            <div className={styles.featuredHead}>
              <div>
                <div className={styles.eyebrow}>پربازدیدترین</div>
                <h2 className={styles.featuredTitle}>رسانه‌های برتر</h2>
              </div>
              <ButtonLink href="/explore" size="sm">مشاهدهٔ همه ←</ButtonLink>
            </div>
            <FeaturedCarousel items={featured} />
          </div>
        </section>
      )}

      <section className={`${styles.stats} ${styles.band}`}>
        <div className={styles.statsGrid}>
          {figures.map(s => (
            <div key={s.label} className={`${styles.stat} ${reveal.reveal}`} style={cssVar("--tone", s.tone)}>
              <div className={styles.statIcon}><s.Icon size={22} /></div>
              <div className={styles.statNum}>{s.num}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} id="types">
        <div className={styles.sectionInner}>
          <div className={`${styles.sectionHead} section-halo ${reveal.reveal}`}>
            <div className={styles.eyebrow}>انواع رسانه</div>
            <h2 className={styles.sectionTitle}>هر نوع رسانه‌ای که نیاز داری</h2>
          </div>
          <div className={styles.typesGrid}>
            {TYPES.map(t => (
              <Link key={t.type} href={`/explore?type=${t.type}`} className={`${styles.typeCard} ${reveal.reveal}`}>
                <div className={styles.typeIcon}><t.Icon size={26} /></div>
                <div>
                  <div className={styles.typeName}>{t.label}</div>
                  <div className={styles.typeCount}>{faNum(stats.byType[t.type] ?? 0)} رسانه موجود</div>
                </div>
                <div className={styles.typeMore}>مشاهده ←</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.band}`} id="how">
        <div className={`${styles.sectionHead} section-halo ${reveal.reveal}`}>
          <div className={styles.eyebrow}>چطور کار می‌کنه؟</div>
          <h2 className={styles.sectionTitle}>سه قدم تا اکران تبلیغ</h2>
        </div>
        <ol className={styles.howGrid}>
          {STEPS.map((s, i) => (
            <li key={s.title} className={`${styles.how} ${reveal.reveal}`}>
              <div className={styles.howIcon}><s.Icon size={26} /><span className={styles.howStep}>{faNum(i + 1)}</span></div>
              <div className={styles.howTitle}>{s.title}</div>
              <div className={styles.howText}>{s.text}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={`${styles.sectionHead} section-halo ${reveal.reveal}`}>
            <div className={styles.eyebrow}>تجربه مشتریان</div>
            <h2 className={styles.sectionTitle}>آن‌ها از رسامپ استفاده کردند</h2>
          </div>
          <div className={styles.quotes}>
            {TESTIMONIALS.map(t => (
              <figure key={t.name} className={`${styles.quote} ${reveal.reveal}`} style={cssVar("--tone", t.color)}>
                <div className={styles.quoteMark} aria-hidden="true">&ldquo;</div>
                <blockquote>{t.text}</blockquote>
                <figcaption>
                  <div className={styles.avatar} aria-hidden="true">{t.name[0]}</div>
                  <div>
                    <div className={styles.quoteName}>{t.name}</div>
                    <div className={styles.quoteCompany}>{t.company}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.brands} ${styles.band}`}>
        <div className={styles.brandsLabel}>همراه برندهایی مثل</div>
        <div className={styles.brandList}>{BRANDS.map(b => <span key={b}>{b}</span>)}</div>
      </section>

      <section className={`${styles.cta} section-halo ${reveal.reveal}`}>
        <h2 className={styles.ctaTitle}>آماده‌ای شروع کنی؟</h2>
        <p className={styles.ctaText}>بیش از {faNum(stats.total)} رسانه منتظرته — رایگان شروع کن</p>
        <div className={styles.ctaButtons}>
          <ButtonLink href="/explore" intent="primary" className={`${styles.ctaButton} btn-sheen`}><Map size={18} /> ورود به پلتفرم</ButtonLink>
          <ButtonLink href="/list-media" className={styles.ctaButton}>ثبت رسانهٔ شما</ButtonLink>
        </div>
      </section>
    </main>
  );
}
