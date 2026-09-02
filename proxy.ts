import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";

const ADMIN_PAGE_PATTERN = /^\/admin(\/|$)/;
const ADMIN_API_PATTERN  = /^\/api\/admin(\/|$)/;
const USER_PAGE_PATTERN  = /^\/(dashboard|list-media)(\/|$)/;
const USER_API_PATTERN   = /^\/api\/(reservations|listings)(\/.*)?$/;
const LOGIN_PATH         = "/admin/login";
const USER_LOGIN_PATH    = "/login";

// Headless/automation UAs — block at proxy level before hitting route handlers
const BLOCK_UA = /python-requests|scrapy|wget\/|curl\/\d|go-http-client|java\/|headlesschrome|phantomjs|htmlunit|selenium|playwright|puppeteer/i;

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

  // Block obvious automation tools at proxy level (before auth/db)
  if (BLOCK_UA.test(ua) && pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
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
    // `/api/:path*` already covers /api/admin, /api/reservations and
    // /api/listings; it's this broad so the bot-UA block runs on every API route.
    "/api/:path*",
  ],
};
