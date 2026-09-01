import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control",        value: "on" },
  { key: "X-Frame-Options",               value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options",        value: "nosniff" },
  { key: "Referrer-Policy",               value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",            value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "X-XSS-Protection",             value: "1; mode=block" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.neshan.org https://fonts.googleapis.com https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://billboardiha.com https://*.tile.openstreetmap.org https://*.neshan.org https://*.basemaps.cartocdn.com https://unpkg.com",
      "connect-src 'self' https://api.neshan.org https://map.ir https://*.basemaps.cartocdn.com https://unpkg.com",
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

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  productionBrowserSourceMaps: false,
  // /api-docs renders docs/api.md at runtime — make sure the standalone/prod
  // build ships that file (it lives outside app/ and public/).
  outputFileTracingIncludes: {
    "/api-docs": ["./docs/api.md"],
  },
};

export default nextConfig;