import type { Metadata } from "next";
import AnalyticsTab from "@/components/AnalyticsTab";
import { BarChart2 } from "lucide-react";
import { getCachedCatalogueAnalytics } from "@/lib/db/cached";
import styles from "./analytics.module.css";

export const metadata: Metadata = {
  title: "تحلیل بازار رسانه‌های محیطی | رسامپ",
  description: "توزیعِ شهر، نوع رسانه و قیمت در بازار تبلیغات محیطی ایران — از دادهٔ واقعیِ کاتالوگ.",
};

export default async function AnalyticsPage() {
  const initial = await getCachedCatalogueAnalytics();
  return (
    <main className={styles.page}>
      <h1 className={styles.title}><BarChart2 size={22} /> تحلیل بازار</h1>
      <p className={styles.lede}>نمای کلی از وضعیت رسانه‌های تبلیغاتی فضای باز در ایران</p>
      <AnalyticsTab initial={initial} />
    </main>
  );
}
