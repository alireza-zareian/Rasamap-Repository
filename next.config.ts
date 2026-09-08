import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control",        value: "on" },
  { key: "X-Frame-Options",               value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options",        value: "nosniff" },
  { key: "Referrer-Policy",               value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",            value: "camera=(), microphone=(), geolocation=(self)" },
  // X-XSS-Protection is deliberately absent. It drove a filter that every
  // current browser has removed, and in the browsers that still honoured it the
  // filter itself introduced vulnerabilities — which is why the guidance is now
  // to send `0` or nothing at all. The Content-Security-Policy below is the
  // control that actually does this job.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Every origin here is one the app actually contacts. The list used to
    // carry Leaflet's CDN, the OpenStreetMap and Carto tile servers and the
    // Neshan API, all left over from a map layer that was removed — an allowed
    // origin nothing uses is a supply-chain hole that buys nothing, and
    // `unpkg.com` in script-src was the worst of them.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline' stays: the App Router streams its payload through inline
      // <script> tags, and the alternative — a per-request nonce — makes every
      // page dynamic, which would undo the prerendered landing page (§29).
      "script-src 'self' 'unsafe-inline'",
      // Required by the project's own convention: styling is inline style={{}}
      // objects (rule 5), which are inline styles as far as CSP is concerned.
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      // data: and blob: are the upload previews, which exist only in the
      // browser that made them.
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

// Hosts allowed to load /_next/* dev resources when `next dev` is reached from
// a non-localhost origin (e.g. a phone on the same Wi-Fi at http://<lan-ip>:3000).
// Dev-only — has no effect on `next build` / `next start`. Add your machine's
// LAN IP here, or set DEV_ORIGINS="192.168.1.35,10.0.0.4" in .env.local.
const devOrigins = (
  process.env.DEV_ORIGINS ??
  // LAN ranges + common free tunnels (localhost.run, cloudflare, serveo).
  "192.168.1.35,192.168.*,10.*,172.16.*,*.lhr.life,*.trycloudflare.com,*.serveo.net"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Where the server keeps rendered pages and cached queries.
//
// Unset: Next.js uses its own cache directory under .next/, which is correct
// for one process on one machine — the demo laptop today.
// Set:   every instance shares one Redis, so a cache entry written by one is
//        read by all, an invalidation reaches all, and a redeploy does not
//        start cold. See cache-handler.js and §25 of docs/engineering-decisions.md.
//
// cacheMaxMemorySize: 0 turns off the in-process LRU that would otherwise sit
// in front of Redis. That layer is faster but private to each process, so it
// would survive an invalidation the shared store had already honoured — which
// is the exact bug Redis is being introduced to prevent.
const redisCache = process.env.REDIS_URL
  ? { cacheHandler: require.resolve("./cache-handler.js"), cacheMaxMemorySize: 0 }
  : {};

const nextConfig: NextConfig = {
  ...redisCache,
  allowedDevOrigins: devOrigins,
  // The test suite builds into its own directory (test/run.mjs sets this), so
  // `npm test` never clobbers the .next that `npm run demo` is serving.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    // No /_next/image endpoint: every size is a file on disk, written once by
    // scripts/build-image-variants.py. See image-loader.js for why.
    loader: "custom",
    loaderFile: "./image-loader.js",
    // The only widths that exist: two pre-built variants and the 500-wide
    // source. Split across the two lists the way Next reads them — `imageSizes`
    // holds sizes below the smallest device width, for small fixed slots like a
    // 72 px thumbnail; `deviceSizes` is the ladder used once a `sizes` string
    // mentions a viewport fraction.
    //
    // The split matters more than it looks. With everything in `deviceSizes`,
    // Next filters the candidates to those at least as wide as the *smallest*
    // device size, so a single entry of 500 silently threw both variants away
    // and every image shipped at full size again.
    imageSizes: [256],
    deviceSizes: [384, 500],
  },
  productionBrowserSourceMaps: false,
  // /api-docs renders docs/api.md at runtime — make sure the standalone/prod
  // build ships that file (it lives outside app/ and public/).
  outputFileTracingIncludes: {
    "/api-docs": ["./docs/api.md"],
  },
};

export default nextConfig;