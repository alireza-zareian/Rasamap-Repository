import type { Metadata, Viewport } from "next";
import "@fontsource-variable/vazirmatn";
import "./reset.css";
import "./globals.css";
import { SITE_URL } from "@/lib/site-url";
import { ThemeProvider } from "@/lib/client/theme";
import { THEME_STORAGE_KEY } from "@/lib/client/theme-key";
import { CurrentUserProvider } from "@/lib/client/use-current-user";
import BackgroundPattern from "@/components/site/BackgroundPattern";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // One fixed value stops mobile "force dark" (Samsung Internet, Chrome)
  // re-colouring the app's own themes. It matches the SSR default below.
  colorScheme: "light",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Rasamap | رسامپ — پلتفرم جامع رسانه‌های محیطی ایران",
  description: "جستجو و مقایسهٔ بیلبورد، تلویزیون شهری، عرشه پل و تمام رسانه‌های محیطی ایران — و تماس مستقیم با صاحب رسانه.",
  keywords: "بیلبورد، اجاره بیلبورد، رسانه محیطی، تبلیغات محیطی، تلویزیون شهری، ثبت آگهی رسانه، rasamap",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Light by default; the <head> script may switch it before paint, hence
    // suppressHydrationWarning.
    <html lang="fa" dir="rtl" data-theme="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        {/* The stored theme, applied before first paint — an effect would flash
            the light default first. CSP allows inline scripts (§29). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="dark"||t==="light"){var e=document.documentElement;e.setAttribute("data-theme",t);e.style.colorScheme=t;}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          {/* "Who is signed in?", asked once per page load and shared. */}
          <CurrentUserProvider>
            <BackgroundPattern />
            <div className="grain-overlay" aria-hidden="true" />
            {children}
          </CurrentUserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
