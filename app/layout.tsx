import type { Metadata, Viewport } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import BackgroundPattern from "@/components/BackgroundPattern";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The app ships its own light/dark themes (data-theme on <html>, plus
  // color-scheme in globals.css). A single fixed value here tells mobile
  // browsers (Samsung Internet, Chrome auto-dark) NOT to apply their own
  // "force dark" filter — that was re-colouring the UI and making it
  // unreadable when the phone's dark mode was on.
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Rasamap | رسامپ — پلتفرم جامع رسانه‌های محیطی ایران",
  description: "جستجو و مقایسهٔ بیلبورد، تلویزیون شهری، عرشه پل و تمام رسانه‌های محیطی ایران — و تماس مستقیم با صاحب رسانه.",
  keywords: "بیلبورد، اجاره بیلبورد، رسانه محیطی، تبلیغات محیطی، تلویزیون شهری، ثبت آگهی رسانه، rasamap",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is the SSR default; the ThemeProvider effect switches it to
    // "light" after mount if the user chose that. suppressHydrationWarning
    // covers that one intentional <html> attribute change.
    <html lang="fa" dir="rtl" data-theme="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </head>
      <body>
        <ThemeProvider>
          <BackgroundPattern />
          <div className="grain-overlay" aria-hidden="true" />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
