import AnalyticsTab from "@/components/AnalyticsTab";
import { BarChart2 } from "lucide-react";
import { getCachedCatalogueAnalytics } from "@/lib/db/cached";
import styles from "./analytics.module.css";

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
