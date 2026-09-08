import type { MetadataRoute } from "next";

/**
 * What a phone needs to keep the site on its home screen.
 *
 * The catalogue is something people come back to — an agency checking prices
 * across a week, an owner watching a submission — and on a phone the difference
 * between a bookmark and an installed icon is whether they come back at all.
 *
 * `display: "standalone"` drops the browser chrome, which matters here because
 * the app is RTL and the address bar is the one piece of UI that is not.
 */
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
    // Matches the SSR default theme in the root layout, so the status bar does
    // not flash a different colour before the page paints.
    background_color: "#0A0E1A",
    theme_color: "#3B7BF5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops a maskable icon to whatever shape the launcher uses; the
      // same square works because the glyph sits well inside the safe area.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
