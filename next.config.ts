import type { NextConfig } from "next";
import { MAX_BILLBOARD_IMAGES, maxUploadBodyBytes } from "./lib/domain/listing";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control",        value: "on" },
  { key: "X-Frame-Options",               value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options",        value: "nosniff" },
  { key: "Referrer-Policy",               value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",            value: "camera=(), microphone=(), geolocation=(self)" },
  // No X-XSS-Protection: browsers removed the filter it drove, which itself
  // caused vulnerabilities. The CSP below does that job.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Only origins the app actually contacts: an allowed origin nothing uses
    // is risk for nothing (§29).
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline': the App Router streams its payload in inline scripts,
      // and a per-request nonce would make every page dynamic (§29).
      "script-src 'self' 'unsafe-inline'",
      // 'unsafe-inline': React `style` props for per-render values (rule 5)
      // and the framework's own injected styles are inline styles to CSP.
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      // data: and blob: are upload previews made in the browser.
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      // The one embedded third party: the location map on a media page.
      "frame-src https://maps.google.com https://www.google.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

// `next dev` only: hosts other than localhost allowed to load /_next/*, such
// as a phone on the Wi-Fi. Override with DEV_ORIGINS="192.168.1.35,…".
const devOrigins = (
  process.env.DEV_ORIGINS ??
  // LAN ranges + common free tunnels (localhost.run, cloudflare, serveo).
  "192.168.1.35,192.168.*,10.*,172.16.*,*.lhr.life,*.trycloudflare.com,*.serveo.net"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Where cached pages and queries live: .next/ for one process (the demo), or
// one Redis shared by every instance when REDIS_URL is set (cache-handler.js,
// §25). cacheMaxMemorySize: 0 drops the per-process layer in front of Redis,
// which would outlive an invalidation the shared store had honoured.
const redisCache = process.env.REDIS_URL
  ? { cacheHandler: require.resolve("./cache-handler.js"), cacheMaxMemorySize: 0 }
  : {};

const nextConfig: NextConfig = {
  ...redisCache,
  allowedDevOrigins: devOrigins,
  // The test runners build elsewhere, so `npm test` never replaces the demo's .next.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // No "X-Powered-By: Next.js": it tells a stranger which advisories to try.
  // With productionBrowserSourceMaps: false below, guarded by the test "no
  // response names the framework, and no source map is built".
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // public/ defaults to max-age=0: every view re-asked about every photo.
      // A photo is named after its media, not its content, so a week, not forever.
      {
        source: "/images/scraped/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
  images: {
    // No /_next/image endpoint: every size is a file written by
    // scripts/build-image-variants.py (image-loader.js, §22c).
    loader: "custom",
    loaderFile: "./image-loader.js",
    // The only widths that exist: two variants and the 500-wide source. The
    // split matters: with all of them in `deviceSizes`, Next drops every
    // candidate narrower than the smallest, and every image shipped full size.
    imageSizes: [256],
    deviceSizes: [384, 500],
  },
  productionBrowserSourceMaps: false,
  experimental: {
    // Proxy buffers at most 10 MB of a body by default and passes on only that,
    // so a larger upload arrived cut short. This is the largest any route accepts.
    proxyClientMaxBodySize: maxUploadBodyBytes(MAX_BILLBOARD_IMAGES),
    // No `viewTransition` flag: since 16.3 the App Router runs navigations as
    // view transitions on its own, which is what lets a card's photo morph into
    // the media page's gallery (§37). A browser without the API simply navigates.
  },
  // Files read at runtime from outside app/ and public/, which the tracer would leave behind.
  outputFileTracingIncludes: {
    "/api-docs": ["./docs/api.md"],
    "/opengraph-image": ["./assets/fonts/*.ttf"],
  },
};

export default nextConfig;