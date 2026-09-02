import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "داشبورد من | رسامپ",
  description: "آگهی‌های من، وضعیت انتشار و تنظیمات حساب کاربری.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
