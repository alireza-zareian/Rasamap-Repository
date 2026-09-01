import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ثبت رسانه رایگان | رسامپ",
  description: "رسانه تبلیغاتی خود را در رسامپ ثبت کنید. کاملاً رایگان، تأیید ظرف ۲۴ ساعت.",
};

export default function ListMediaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
