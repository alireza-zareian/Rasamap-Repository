import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "بازیابی رمز عبور | رسامپ",
  description: "بازیابی رمز عبور حساب کاربری رسامپ با رمز یک‌بارمصرفِ پیامکی.",
  // Useful to a person, useless in a search result — and in the admin case,
  // private. Keeping it out of the index means nobody arrives here from Google
  // expecting to find media.
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
