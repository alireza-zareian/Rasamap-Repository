import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { getFilteredBillboards, toPublicBillboard } from "@/lib/db/billboards";
import { ALLOWED_SORT, MIN_RADIUS_KM, MAX_RADIUS_KM, DEFAULT_RADIUS_KM } from "@/lib/explore-query";
import { AVAILABILITIES, BILLBOARD_TYPES } from "@/lib/types";
import { catalogueApiRateLimit } from "@/lib/rate-limit";
import { invalid } from "@/lib/domain/errors";
import { faNum } from "@/lib/format";

/** How deep one query may page, and how many rows a page may carry (§20b). No page uses this route. */
const MAX_API_PAGE = 5;
const MAX_API_LIMIT = 48;

const querySchema = z.object({
  search:   z.string().max(100).optional(),
  type:     z.enum(BILLBOARD_TYPES).optional(),
  availability: z.enum(AVAILABILITIES).optional(),
  city:     z.string().max(60).optional(),
  cities:   z.string().max(500).optional(), // comma-separated city names for province filter
  maxPrice: z.coerce.number().int().min(0).max(100_000).optional(),
  sortBy:   z.enum(ALLOWED_SORT).optional(),
  // Together they cap one query at 5 × 48 rows; more means narrower filters, each spending the same budget.
  page:     z.coerce.number().int().min(1).max(MAX_API_PAGE).optional(),
  limit:    z.coerce.number().int().min(1).max(MAX_API_LIMIT).optional(),
  // The radius ceiling stops one huge circle from reading the whole country (§20).
  lat:      z.coerce.number().min(-90).max(90).optional(),
  lng:      z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().int().min(MIN_RADIUS_KM).max(MAX_RADIUS_KM).optional(),
});

export const GET = defineRoute(
  {
    name: "billboards",
    access: "public",
    rateLimit: catalogueApiRateLimit,
    query: querySchema,
    messages: {
      invalidQuery: `پارامترهای جستجو نامعتبر است — حداکثر ${faNum(MAX_API_PAGE)} صفحه و ${faNum(MAX_API_LIMIT)} مورد در هر صفحه؛ برای بیشتر، جستجو را محدودتر کنید`,
    },
  },
  async ({ query }) => {
    const { cities: citiesRaw, lat, lng, radiusKm, ...rest } = query;
    const cityIn = citiesRaw
      ? citiesRaw.split(",").map(c => c.trim()).filter(Boolean).slice(0, 50)
      : undefined;

    // Both coordinates or neither, as parseNear() in lib/explore-query.ts.
    if ((lat === undefined) !== (lng === undefined)) {
      throw invalid("برای جست‌وجوی شعاعی باید هر دو مختصات داده شود");
    }
    const near = lat !== undefined && lng !== undefined
      ? { lat, lng, radiusKm: radiusKm ?? DEFAULT_RADIUS_KM }
      : undefined;

    const { items, total } = await getFilteredBillboards({ ...rest, cityIn, near });
    const limit = query.limit ?? 24;
    const page  = query.page  ?? 1;
    return NextResponse.json(
      { items: items.map(toPublicBillboard), total, page, pageSize: limit, totalPages: Math.ceil(total / limit) },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  },
);
