import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "نقشه رسانه‌ها | رسامپ",
  description: "مشاهده موقعیت جغرافیایی بیلبوردها روی نقشه واقعی ایران.",
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
