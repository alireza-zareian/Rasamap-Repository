import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { z } from "zod";
import { getFilteredBillboards, toPublicBillboard } from "@/lib/db/billboards";
import { ALLOWED_TYPES, ALLOWED_STATUS, ALLOWED_SORT, MIN_RADIUS_KM, MAX_RADIUS_KM, DEFAULT_RADIUS_KM } from "@/lib/explore-query";
import { publicApiRateLimit } from "@/lib/auth/rate-limit";
import { serverError } from "@/lib/api-error";
import { withApiLog } from "@/lib/api-log";

// Bot user agents are rejected in proxy.ts for every /api/* path, so the
// per-route copies of that list are gone — one matcher, one place to update.

const querySchema = z.object({
  search:   z.string().max(100).optional(),
  type:     z.enum(ALLOWED_TYPES).optional(),
  status:   z.enum(ALLOWED_STATUS).optional(),
  city:     z.string().max(60).optional(),
  cities:   z.string().max(500).optional(), // comma-separated city names for province filter
  maxPrice: z.coerce.number().int().min(0).max(100_000).optional(),
  sortBy:   z.enum(ALLOWED_SORT).optional(),
  // Page and size ceilings are anti-scraping limits as much as validation ones:
  // together they cap how much of the catalogue one request can carry off.
  page:     z.coerce.number().int().min(1).max(200).optional(),
  limit:    z.coerce.number().int().min(1).max(48).optional(),
  // Radial search. The radius ceiling is the same anti-scraping limit as the
  // ones above: without it, one request with a huge radius is a way to ask for
  // the whole country and step past the page cap (§20).
  lat:      z.coerce.number().min(-90).max(90).optional(),
  lng:      z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().int().min(MIN_RADIUS_KM).max(MAX_RADIUS_KM).optional(),
});

async function getHandler(req: NextRequest) {
  const ip = getClientIp(req);

  const rl = publicApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "billboards", ip });

  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "پارامترهای نامعتبر" }, { status: 400 });
  }

  const { cities: citiesRaw, lat, lng, radiusKm, ...rest } = parsed.data;
  const cityIn = citiesRaw
    ? citiesRaw.split(",").map(c => c.trim()).filter(Boolean).slice(0, 50)
    : undefined;

  // Both coordinates or neither — half a centre is not a narrower search, and
  // quietly keeping the half that parsed would centre it somewhere nobody asked
  // for. Same rule as parseNear() in lib/explore-query.ts.
  if ((lat === undefined) !== (lng === undefined)) {
    return NextResponse.json(
      { error: "برای جست‌وجوی شعاعی باید هر دو مختصات داده شود" },
      { status: 400 },
    );
  }
  const near = lat !== undefined && lng !== undefined
    ? { lat, lng, radiusKm: radiusKm ?? DEFAULT_RADIUS_KM }
    : undefined;

  try {
    const { items, total } = await getFilteredBillboards({ ...rest, cityIn, near });
    const limit = parsed.data.limit ?? 24;
    const page  = parsed.data.page  ?? 1;
    const publicItems = items.map(toPublicBillboard);
    return NextResponse.json(
      { items: publicItems, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return serverError("GET /api/billboards", err);
  }
}

export const GET = withApiLog("billboards", getHandler);
