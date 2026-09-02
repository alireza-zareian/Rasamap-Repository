import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp } from "@/lib/auth/client-ip";
import { checkRateLimit } from "@/lib/auth/rate-limit";

const ADMIN_PAGE_PATTERN = /^\/admin(\/|$)/;
const ADMIN_API_PATTERN  = /^\/api\/admin(\/|$)/;
const USER_PAGE_PATTERN  = /^\/(dashboard|list-media)(\/|$)/;
const USER_API_PATTERN   = /^\/api\/listings(\/.*)?$/;
const LOGIN_PATH         = "/admin/login";
const USER_LOGIN_PATH    = "/login";

// Catalogue pages worth protecting from bulk copying. These are the only pages
// that carry listing data; marketing pages are cheap and left alone.
const CATALOGUE_PAGE = /^\/(explore|billboard)(\/|$)/;

// Media that costs us bandwidth and is the actual product for a copycat.
const PROTECTED_ASSET = /^\/(images\/scraped|uploads)\//;

// Headless/automation UAs — blocked before any route handler runs. This is a
// speed bump, not a wall: a scraper only has to change one header to get past
// it. The per-IP budgets below are what actually make bulk copying expensive.
const BLOCK_UA = /python-requests|scrapy|wget\/|curl\/\d|go-http-client|java\/|headlesschrome|phantomjs|htmlunit|selenium|playwright|puppeteer|node-fetch|axios|okhttp|apache-httpclient|libwww|lwp-|colly|httpx/i;

// Search-engine crawlers we deliberately let through: the site needs to be
// findable, and blocking them would cost more than the scraping they enable.
// UA alone is spoofable — a fake Googlebot still meets the same rate limits as
// everyone else, it just isn't rejected on sight.
const SEARCH_BOT = /googlebot|bingbot|duckduckbot|yandexbot|applebot|slurp/i;

function addSecurityHeaders(res: NextResponse, isAdmin = false): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (isAdmin) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

function tooManyRequests(retryAfterSecs: number): NextResponse {
  return NextResponse.json(
    { error: "درخواست‌های بیش از حد مجاز — کمی صبر کنید" },
    { status: 429, headers: { "Retry-After": String(retryAfterSecs) } },
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ua = req.headers.get("user-agent") ?? "";
  const isSearchBot = SEARCH_BOT.test(ua);

  // ── Anti-scraping: bot user agents ──
  if (!isSearchBot && BLOCK_UA.test(ua) && (pathname.startsWith("/api/") || CATALOGUE_PAGE.test(pathname))) {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
  }

  // ── Anti-scraping: hotlink protection on listing media ──
  // A cross-origin page embedding our images is a clone site using our
  // bandwidth. A missing Referer is allowed: direct navigation, privacy modes
  // and some mobile browsers send none, and refusing those breaks real users.
  if (PROTECTED_ASSET.test(pathname)) {
    const referer = req.headers.get("referer");
    if (referer) {
      let sameOrigin = false;
      try {
        sameOrigin = new URL(referer).host === req.nextUrl.host;
      } catch {
        sameOrigin = false; // unparseable Referer — treat as foreign
      }
      if (!sameOrigin) {
        return new NextResponse(null, { status: 403 });
      }
    }
  }

  // ── Anti-scraping: per-IP budget on catalogue pages ──
  // The HTML pages carry the same records as the API, so limiting only the API
  // would leave the cheaper door open. 90/min is far above human browsing
  // (a person opens a handful of listings a minute) and far below a crawler.
  if (!isSearchBot && CATALOGUE_PAGE.test(pathname)) {
    const rl = checkRateLimit(`catalogue_page:${getClientIp(req)}`, {
      windowMs: 60 * 1000,
      maxRequests: 90,
      lockoutMs: 5 * 60 * 1000,
    });
    if (!rl.allowed) {
      return tooManyRequests(Math.max(1, Math.ceil(((rl.lockedUntil ?? rl.resetAt) - Date.now()) / 1000)));
    }
  }

  const isAdminPage = ADMIN_PAGE_PATTERN.test(pathname);
  const isAdminApi  = ADMIN_API_PATTERN.test(pathname);
  const isUserPage  = USER_PAGE_PATTERN.test(pathname);
  const isUserApi   = USER_API_PATTERN.test(pathname);

  if (!isAdminPage && !isAdminApi && !isUserPage && !isUserApi) return NextResponse.next();

  // Always accessible: login pages and auth APIs
  if (pathname === LOGIN_PATH || pathname === "/api/admin/auth/login") return addSecurityHeaders(NextResponse.next(), true);
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  const session = await getSessionFromRequest(req);

  // ── Admin routes — require an admin role ──
  if (isAdminPage || isAdminApi) {
    const isAdminRole = session && session.role !== "user";
    if (!isAdminRole) {
      if (isAdminApi) {
        return NextResponse.json({ error: "احراز هویت لازم است", code: "AUTH_REQUIRED" }, { status: 401 });
      }
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = LOGIN_PATH;
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return addSecurityHeaders(NextResponse.next(), true);
  }

  // ── User routes — require any valid session ──
  if (isUserPage || isUserApi) {
    if (!session) {
      if (isUserApi) {
        return NextResponse.json({ error: "احراز هویت لازم است", code: "AUTH_REQUIRED" }, { status: 401 });
      }
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = USER_LOGIN_PATH;
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return addSecurityHeaders(NextResponse.next());
  }

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/list-media/:path*",
    // Catalogue pages and listing media, for the anti-scraping checks above.
    "/explore/:path*",
    "/billboard/:path*",
    "/images/scraped/:path*",
    "/uploads/:path*",
    // `/api/:path*` already covers /api/admin and /api/listings; it's this broad
    // so the bot-UA block runs on every API route.
    "/api/:path*",
  ],
};
