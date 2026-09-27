import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "جستجوی رسانه | رسامپ",
  description: "جستجو و فیلتر بیش از ۲۸۰۰ بیلبورد، تلویزیون شهری، عرشه پل و ایستگاه در ۸۷ شهر ایران.",
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
