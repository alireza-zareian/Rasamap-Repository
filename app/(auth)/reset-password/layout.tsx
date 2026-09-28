import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "بازیابی رمز عبور | رسامپ",
  description: "بازیابی رمز عبور حساب کاربری رسامپ با رمز یک‌بارمصرفِ پیامکی.",
  // Useful to a person, useless as a search result.
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
