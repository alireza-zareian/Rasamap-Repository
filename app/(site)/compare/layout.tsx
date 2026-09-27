import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "مقایسهٔ رسانه‌ها | رسامپ",
  description: "دو رسانه را کنار هم بگذارید و بر پایهٔ بازدید، قیمت و ابعاد تصمیم بگیرید.",
  // Useful to a person, useless in a search result — and in the admin case,
  // private. Keeping it out of the index means nobody arrives here from Google
  // expecting to find media.
  robots: { index: false, follow: false },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
