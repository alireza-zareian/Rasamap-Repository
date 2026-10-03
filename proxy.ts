import { NextResponse, type NextRequest } from "next/server";
import { sessionHint } from "@/lib/auth/session";
import { slugExists } from "@/lib/db/billboards";

const ADMIN_PAGE_PATTERN = /^\/admin(\/|$)/;
/** Exempt from the bot filter — see "Health" in proxy(). */
const HEALTH_PATH        = "/api/health";
const ADMIN_API_PATTERN  = /^\/api\/admin(\/|$)/;
const USER_PAGE_PATTERN  = /^\/(dashboard|list-media)(\/|$)/;
const USER_API_PATTERN   = /^\/api\/listings(\/.*)?$/;
/** Forwards to /login?as=staff; left reachable for old links and bookmarks. */
const LEGACY_STAFF_LOGIN = "/admin/login";
const USER_LOGIN_PATH    = "/login";
const FORBIDDEN_PATH     = "/forbidden";
const LEGACY_ADMIN_TABS  = ["billboards", "listings", "leads", "quality", "scraper", "users", "audit"];

// The only pages that carry listing data.
const CATALOGUE_PAGE = /^\/(explore|billboard)(\/|$)/;

/** A media page itself, not its /preview. */
const MEDIA_PAGE = /^\/billboard\/[^/]+$/;

/** Whether percent-decoding the path would throw, as Next's own param decoding then does (a 500). */
function undecodable(pathname: string): boolean {
  try {
    decodeURIComponent(pathname);
    return false;
  } catch {
    return true;
  }
}

// Photos: bandwidth, and what a copy site would want.
const PROTECTED_ASSET = /^\/(images\/scraped|uploads)\//;

// Automation user agents. A speed bump, not a wall: changing one header gets
// past it (§20). Only tools no person browses with — `okhttp` is absent
// because Android in-app browsers and link previews send it.
const BLOCK_UA = /python-requests|scrapy|wget\/|curl\/\d|go-http-client|java\/|headlesschrome|phantomjs|htmlunit|selenium|playwright|puppeteer|node-fetch|axios|apache-httpclient|libwww|lwp-|colly|httpx/i;

// Search engines, let through so the site stays findable. A fake one meets the
// same rate limits as anyone.
const SEARCH_BOT = /googlebot|bingbot|duckduckbot|yandexbot|applebot|slurp/i;

/** On top of next.config.ts's headers: the panel is never framed, not even by this site, and never indexed. */
function adminHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Health, before anything else ──
  // Monitors call themselves curl or Go-http-client, which the bot filter
  // refuses. The endpoint returns no data, so exempting it gives a scraper nothing.
  if (pathname === HEALTH_PATH) return NextResponse.next();

  // "/billboard/%E0%A4%A" reached the route and failed there with a 500. It
  // names nothing, so it gets the not-found page (any path with no route).
  if (undecodable(pathname)) {
    const missing = req.nextUrl.clone();
    missing.pathname = "/404";
    return NextResponse.rewrite(missing);
  }

  const ua = req.headers.get("user-agent") ?? "";
  const isSearchBot = SEARCH_BOT.test(ua);

  // ── Anti-scraping: bot user agents ──
  if (!isSearchBot && BLOCK_UA.test(ua) && (pathname.startsWith("/api/") || CATALOGUE_PAGE.test(pathname))) {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
  }

  // ── Anti-scraping: hotlink protection on listing media ──
  // Another site embedding our photos is refused. No Referer at all is allowed:
  // direct opens, privacy modes and some mobile browsers send none.
  if (PROTECTED_ASSET.test(pathname)) {
    const referer = req.headers.get("referer");
    if (referer) {
      // The host the browser used — never `req.nextUrl.host`, which is the
      // server's bind name and refused every photo to a phone on the LAN (rule 9).
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

  // No per-address budget on catalogue pages (§20a): it stopped people sharing
  // one office or demo network, not scrapers, who rotate addresses. The data is
  // guarded by what costs a person nothing — the 48-row page cap, the phone
  // behind a session, hotlink protection, and limits on writes and sign-in.

  // A media page is cached for visitors and reads no cookie (§39); a staff
  // session is sent to the uncached preview beside it, which checks the account
  // again. A rewrite, so the address bar and every link keep the public URL.
  //
  // The cache stores whatever it renders, a 404 included — about 104 KB per
  // address — so a loop over made-up slugs would fill the disk. An unknown slug
  // goes the uncached way too, where it is a plain 404 (one indexed lookup).
  if (MEDIA_PAGE.test(pathname)) {
    const slug = decodeURIComponent(pathname.slice("/billboard/".length));
    if (sessionHint(req) === "staff" || !(await slugExists(slug))) {
      const preview = req.nextUrl.clone();
      preview.pathname = `${pathname}/preview`;
      return NextResponse.rewrite(preview);
    }
  }

  // Old `/admin?tab=` links forward to the section's own address.
  if (pathname === "/admin") {
    const tab = req.nextUrl.searchParams.get("tab");
    if (tab && LEGACY_ADMIN_TABS.includes(tab)) {
      const target = req.nextUrl.clone();
      target.pathname = `/admin/${tab}`;
      target.searchParams.delete("tab");
      return NextResponse.redirect(target);
    }
  }

  const isAdminPage = ADMIN_PAGE_PATTERN.test(pathname);
  const isAdminApi  = ADMIN_API_PATTERN.test(pathname);
  const isUserPage  = USER_PAGE_PATTERN.test(pathname);
  const isUserApi   = USER_API_PATTERN.test(pathname);

  if (!isAdminPage && !isAdminApi && !isUserPage && !isUserApi) return NextResponse.next();

  // Always accessible: login pages and auth APIs
  if (pathname === LEGACY_STAFF_LOGIN) return adminHeaders(NextResponse.next());
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  // The cookie's claim, for routing only — Next's "optimistic check", with no
  // database read. Pages and defineRoute decide access from the real session.
  const session = sessionHint(req);

  // ── Admin routes ──
  // Signed out → sign in; signed in as a customer → 403, not a sign-in form.
  if (isAdminPage || isAdminApi) {
    const isStaff = session === "staff";
    if (!isStaff) {
      if (isAdminApi) {
        return session
          ? NextResponse.json({ error: "دسترسی کافی ندارید", code: "FORBIDDEN" }, { status: 403 })
          : NextResponse.json({ error: "احراز هویت لازم است", code: "AUTH_REQUIRED" }, { status: 401 });
      }
      if (session) {
        // A rewrite keeps the address in the bar and the 403 on the response.
        const forbidden = req.nextUrl.clone();
        forbidden.pathname = FORBIDDEN_PATH;
        forbidden.search = "";
        return adminHeaders(NextResponse.rewrite(forbidden, { status: 403 }));
      }
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = USER_LOGIN_PATH;
      loginUrl.search = "";
      loginUrl.searchParams.set("as", "staff");
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return adminHeaders(NextResponse.next());
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
    return NextResponse.next();
  }

  return NextResponse.next();
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
    // All of /api/, so the bot filter covers every API route.
    "/api/:path*",
  ],
};
