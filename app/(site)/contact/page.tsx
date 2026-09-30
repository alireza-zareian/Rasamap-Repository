import type { Metadata } from "next";
import { Mail, Send, Building2, Clock } from "lucide-react";
import styles from "../info-pages.module.css";
import button from "@/components/ui/button.module.css";

export const metadata: Metadata = {
  title: "تماس با ما | رسامپ",
  description: "راه‌های تماس با تیم رسامپ برای صاحبان رسانه، آژانس‌های تبلیغاتی و تبلیغ‌دهندگان.",
};

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
    <main id="main" className={styles.page}>
      <div className={styles.narrow}>
        <div className="section-halo">
          <h1 className={styles.h1}>تماس با ما</h1>
          <div className={styles.rule} />
          <p className={styles.lede}>رسامپ یک پروژه دانشگاهی است. برای سوال، پیشنهاد، یا همکاری از کانال‌های زیر تماس بگیرید.</p>
        </div>

        <div className={styles.channels}>
          {contacts.map(c => (
            <div key={c.label} className={`${styles.card} ${styles.channel}`}>
              <c.Icon size={22} />
              <div className={styles.channelLabel}>{c.label}</div>
              {c.href ? (
                <a href={c.href} className={styles.channelValue}
                  {...(c.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                  {c.val}
                </a>
              ) : (
                <div className={styles.channelValue}>{c.val}</div>
              )}
              <div className={styles.channelSub}>{c.sub}</div>
            </div>
          ))}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>تماس مستقیم</h2>
          <p className={styles.cardText}>
            برای ارسال پیام می‌توانید مستقیماً از طریق ایمیل یا تلگرام با ما در ارتباط باشید.
            در اسرع وقت پاسخ می‌دهیم.
          </p>
          <div className={styles.actions}>
            {/* Plain <a>: mailto: and outside sites are not routes. */}
            <a href="mailto:info@rasamap.ir" className={`${button.button} ${button.primary}`}><Mail size={15} /> ارسال ایمیل</a>
            <a href="https://t.me/rasamap" target="_blank" rel="noopener noreferrer" className={`${button.button} ${button.secondary}`}><Send size={15} /> تلگرام</a>
          </div>
        </div>
      </div>
    </main>
  );
}
