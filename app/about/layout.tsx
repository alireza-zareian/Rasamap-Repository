import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "دربارهٔ رسامپ",
  description: "رسامپ چیست، داده‌هایش از کجا می‌آید، و مدلِ تخمینِ بازدید چطور کار می‌کند.",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
