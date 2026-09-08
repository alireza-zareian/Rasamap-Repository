import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "قوانین و شرایط استفاده | رسامپ",
  description: "شرایط استفاده از رسامپ، مسئولیتِ صحتِ آگهی‌ها، و سیاستِ حریم خصوصی.",
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
