import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تماس با ما | رسامپ",
  description: "راه‌های تماس با تیم رسامپ برای صاحبان رسانه، آژانس‌های تبلیغاتی و تبلیغ‌دهندگان.",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
