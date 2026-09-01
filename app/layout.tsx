import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import BackgroundPattern from "@/components/BackgroundPattern";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Rasamap | رسامپ — پلتفرم جامع رسانه‌های محیطی ایران",
  description: "جستجو، مقایسه و رزرو آنلاین بیلبورد، تلویزیون شهری، عرشه پل و تمام رسانه‌های محیطی ایران.",
  keywords: "بیلبورد، اجاره بیلبورد، رسانه محیطی، تبلیغات محیطی، تلویزیون شهری، rasamap",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="preload"
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap"
          as="style"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>
          <BackgroundPattern />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
