import type { MetadataRoute } from "next";

/** What a phone needs to put the site on its home screen, without browser chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "رسامپ — رسانه‌های محیطی ایران",
    short_name: "رسامپ",
    description:
      "جست‌وجو و مقایسهٔ بیلبورد، تلویزیون شهری، عرشه پل و ایستگاه در سراسر ایران.",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "fa-IR",
    // The dark theme's page colour; the default theme is light (app/layout.tsx).
    background_color: "#0A0E1A",
    theme_color: "#3B7BF5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // The glyph sits inside the maskable safe area, so the same square works.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
