import type { Metadata, Viewport } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import { SITE_URL } from "@/lib/site-url";
import { ThemeProvider, THEME_STORAGE_KEY } from "@/lib/theme";
import { CurrentUserProvider } from "@/lib/auth/useCurrentUser";
import BackgroundPattern from "@/components/BackgroundPattern";
import StaffBar from "@/components/StaffBar";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The app ships its own light/dark themes (data-theme on <html>, plus
  // color-scheme in globals.css). A single fixed value here tells mobile
  // browsers (Samsung Internet, Chrome auto-dark) NOT to apply their own
  // "force dark" filter — that was re-colouring the UI and making it
  // unreadable when the phone's dark mode was on. It matches the SSR default
  // theme below; the in-app toggle still switches the real theme after mount.
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
    // data-theme is the SSR default (light). The inline script in <head> below
    // overwrites it before the first paint when the visitor stored "dark", so
    // the server's attribute and the document's can differ by the time React
    // hydrates — which is what suppressHydrationWarning covers here.
    <html lang="fa" dir="rtl" data-theme="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        {/* Applies the stored theme before the first paint.
            ThemeProvider reads the same key, but it runs in an effect — i.e.
            after the browser has already painted the light default above — so a
            visitor who chose dark saw a white flash on every single navigation.
            A blocking inline script in <head> is the only place that runs
            earlier than paint. CSP allows it: script-src keeps 'unsafe-inline'
            for the App Router's own streaming payload (§29).
            Kept in sync with lib/theme.tsx by THEME_STORAGE_KEY. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="dark"||t==="light"){var e=document.documentElement;e.setAttribute("data-theme",t);e.style.colorScheme=t;}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          {/* Wraps everything so the "who is signed in?" answer is fetched once
              per page load and shared, rather than once per component that
              wants it — StaffBar below is on every page, and Topbar and
              BillboardContact join it on a media page. */}
          <CurrentUserProvider>
            <BackgroundPattern />
            <div className="grain-overlay" aria-hidden="true" />
            {children}
            <StaffBar />
          </CurrentUserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
