import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";

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
// `okhttp` is deliberately absent from this list. It is the HTTP client inside
// a great many Android apps, so it shows up in in-app browsers and link
// previews — a reviewer opening the demo link from a messaging app would have
// been met with a 403 and no explanation. The tools left here are ones no
// person browses with.
const BLOCK_UA = /python-requests|scrapy|wget\/|curl\/\d|go-http-client|java\/|headlesschrome|phantomjs|htmlunit|selenium|playwright|puppeteer|node-fetch|axios|apache-httpclient|libwww|lwp-|colly|httpx/i;

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
      // Compare against the host the *browser* actually used, which is the
      // Host header (or X-Forwarded-Host behind a proxy) — never
      // `req.nextUrl.host`. Under `next start` that one is the server's own
      // bind hostname ("localhost:3000") no matter what the client asked for,
      // so every visitor arriving by LAN IP or by domain name was serving a
      // same-origin Referer that did not match, and got 403 on every photo.
      // That is how the site looked image-less on a phone on the same Wi-Fi
      // while it looked fine on the laptop.
      const expected = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host)
        .split(",")[0]
        .trim()
        .toLowerCase();
      let sameOrigin = false;
      try {
        sameOrigin = new URL(referer).host.toLowerCase() === expected;
      } catch {
        sameOrigin = false; // unparseable Referer — treat as foreign
      }
      if (!sameOrigin) {
        return new NextResponse(null, { status: 403 });
      }
    }
  }

  // No per-IP budget on catalogue *pages*, deliberately. There used to be one,
  // and it was a mistake in both directions.
  //
  // It did not stop a scraper: anyone serious rotates addresses, and the thing
  // actually worth protecting — the owner's phone number — is behind a session
  // and is never in a page's HTML at all. What it did stop was people. Several
  // visitors behind one university or office NAT share a single address, so a
  // demo where a reviewer, a phone and a laptop all browse at once spends one
  // budget between them; and a person who reloads a few times too often was met
  // with a refusal, which no ordinary site does.
  //
  // What still guards the data is the part that costs a human nothing: the
  // page cap of 48 records, the owner phone behind a session, hotlink
  // protection on the media, and rate limits on the endpoints that write or
  // authenticate. See §20.

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
