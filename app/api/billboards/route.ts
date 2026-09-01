import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFilteredBillboards } from "@/lib/db/billboards";
import { publicApiRateLimit } from "@/lib/auth/rate-limit";
import { serverError } from "@/lib/api-error";

// Known scraper/bot UA substrings — block silently (return empty, not 403)
const BOT_UA_PATTERNS = [
  /python-requests/i, /scrapy/i, /curl\/\d/i, /wget\//i,
  /go-http-client/i, /java\//i, /libwww/i, /lwp-/i,
  /headlesschrome/i, /phantomjs/i, /htmlunit/i, /selenium/i,
  /playwright/i, /puppeteer/i,
];

function isBotUA(ua: string): boolean {
  return BOT_UA_PATTERNS.some(p => p.test(ua));
}

const ALLOWED_TYPES   = ["billboard", "digital", "bridge", "station", "vehicle"] as const;
const ALLOWED_STATUS  = ["available", "busy", "reserved", "inactive"] as const;
const ALLOWED_SORT    = ["price_asc", "price_desc", "traffic_desc", "area_desc"] as const;

const querySchema = z.object({
  search:   z.string().max(100).optional(),
  type:     z.enum(ALLOWED_TYPES).optional(),
  status:   z.enum(ALLOWED_STATUS).optional(),
  city:     z.string().max(60).optional(),
  cities:   z.string().max(500).optional(), // comma-separated city names for province filter
  maxPrice: z.coerce.number().int().min(0).max(100_000).optional(),
  sortBy:   z.enum(ALLOWED_SORT).optional(),
  page:     z.coerce.number().int().min(1).max(1000).optional(),
  limit:    z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "";

  // Silent empty response for known scraper UAs — don't reveal we detected them
  if (isBotUA(ua)) {
    return NextResponse.json({ items: [], total: 0, page: 1, pageSize: 24, totalPages: 0 });
  }

  const rl = publicApiRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "درخواست‌های بیش از حد مجاز — کمی صبر کنید" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.lockedUntil! - Date.now()) / 1000)),
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "پارامترهای نامعتبر" }, { status: 400 });
  }

  const { cities: citiesRaw, ...rest } = parsed.data;
  const cityIn = citiesRaw
    ? citiesRaw.split(",").map(c => c.trim()).filter(Boolean).slice(0, 50)
    : undefined;

  try {
    const { items, total } = await getFilteredBillboards({ ...rest, cityIn });
    const limit = parsed.data.limit ?? 24;
    const page  = parsed.data.page  ?? 1;
    return NextResponse.json(
      { items, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return serverError("GET /api/billboards", err);
  }
}
