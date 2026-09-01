import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBillboardBySlug } from "@/lib/db/billboards";
import { publicApiRateLimit } from "@/lib/auth/rate-limit";
import { serverError } from "@/lib/api-error";

// Known scraper/bot UA substrings — respond empty (not 403), same as the list route.
const BOT_UA_PATTERNS = [
  /python-requests/i, /scrapy/i, /curl\/\d/i, /wget\//i,
  /go-http-client/i, /java\//i, /libwww/i, /lwp-/i,
  /headlesschrome/i, /phantomjs/i, /htmlunit/i, /selenium/i,
  /playwright/i, /puppeteer/i,
];
const isBotUA = (ua: string) => BOT_UA_PATTERNS.some((p) => p.test(ua));

// Slugs are lowercase latin + digits + hyphens (see prisma/seed.ts).
const slugSchema = z.string().min(1).max(120).regex(/^[a-z0-9-]+$/);

// GET /api/billboards/[slug] — PUBLIC: one billboard by slug.
// The detail page (app/billboard/[slug]/page.tsx) reads through the same
// getBillboardBySlug() data layer as a Server Component; this endpoint exposes
// the same resource over REST for API clients and tests.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "";

  if (isBotUA(ua)) {
    return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  }

  const rl = publicApiRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "درخواست‌های بیش از حد مجاز — کمی صبر کنید" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.lockedUntil! - Date.now()) / 1000)) } },
    );
  }

  const { slug } = await params;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }

  try {
    const billboard = await getBillboardBySlug(parsed.data);
    if (!billboard) {
      return NextResponse.json({ error: "رسانه یافت نشد" }, { status: 404 });
    }
    return NextResponse.json(
      { billboard },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return serverError("GET /api/billboards/[slug]", err, { slug });
  }
}
