import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "مقایسهٔ رسانه‌ها | رسامپ",
  description: "دو رسانه را کنار هم بگذارید و بر پایهٔ بازدید، قیمت و ابعاد تصمیم بگیرید.",
  // Useful to a person, useless as a search result.
  robots: { index: false, follow: false },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
