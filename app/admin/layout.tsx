import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "پنل مدیریت | رسامپ",
  description: "داشبورد مدیریت رسامپ — مدیریت بیلبوردها، کاربران و لاگ‌های امنیتی.",
  robots: "noindex, nofollow",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
