import IntentLink from "@/components/ui/IntentLink";
import { Logo } from "./Logo";
import styles from "./chrome.module.css";
import defer from "@/components/ui/defer.module.css";

const COLUMNS = [
  { title: "پلتفرم", links: [["جستجوی رسانه", "/explore"], ["نقشهٔ رسانه‌ها", "/explore/map"], ["طرح کمپین", "/campaign"], ["تحلیل بازار", "/analytics"]] },
  { title: "کاربران", links: [["ورود / ثبت‌نام", "/login"], ["ذخیره‌شده‌ها", "/saved"], ["داشبورد", "/dashboard"], ["ثبت رسانه", "/list-media"]] },
  { title: "شرکت", links: [["درباره ما", "/about"], ["راهنما و پرسش‌ها", "/help"], ["تماس با ما", "/contact"], ["قوانین و مقررات", "/terms"]] },
];

export default function Footer() {
  return (
    <footer className={`${styles.footer} ${defer.defer}`}>
      <div className={styles.footerInner}>
        <div className={styles.footerGrid}>
          <div>
            <Logo />
            <p className={styles.blurb}>فهرست آنلاین رسانه‌های تبلیغاتی محیطی ایران — جستجو، مقایسه و تماس بدون واسطه</p>
            <div className={styles.social}>
              <a href="https://t.me/rasamap" target="_blank" rel="noopener noreferrer">تلگرام</a>
              <a href="mailto:info@rasamap.ir">ایمیل</a>
            </div>
          </div>
          {COLUMNS.map(col => (
            <div key={col.title}>
              <div className={styles.colTitle}>{col.title}</div>
              <ul className={styles.colLinks}>
                {col.links.map(([label, href]) => <li key={href}><IntentLink href={href}>{label}</IntentLink></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className={styles.legal}>
          <span>© ۱۴۰۵ رسامپ — تمامی حقوق محفوظ است</span>
          <nav aria-label="حقوقی">
            <IntentLink href="/terms">قوانین</IntentLink>
            <IntentLink href="/contact">تماس</IntentLink>
          </nav>
        </div>
      </div>
    </footer>
  );
}
