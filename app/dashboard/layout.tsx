import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "داشبورد من | رسامپ",
  description: "رزروهای من، تنظیمات حساب کاربری و مدیریت آگهی‌ها.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
