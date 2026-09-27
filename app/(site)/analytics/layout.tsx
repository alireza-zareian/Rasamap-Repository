import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تحلیل بازار رسانه‌های محیطی | رسامپ",
  description: "توزیعِ شهر، نوع رسانه و قیمت در بازار تبلیغات محیطی ایران — از دادهٔ واقعیِ کاتالوگ.",
};

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
