import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { slugParams } from "@/lib/http/params";
import { publicApiRateLimit } from "@/lib/rate-limit";
import { getBillboardBySlug, toPublicBillboard } from "@/lib/db/billboards";
import { notFound } from "@/lib/domain/errors";

// GET /api/billboards/[slug] — one published media item. The detail page reads
// the same getBillboardBySlug() as a Server Component; this is the same
// resource over REST, for API clients and tests. The owner's phone is never in
// it — see POST /api/billboards/[slug]/contact.
export const GET = defineRoute(
  { name: "billboards/[slug]", access: "public", rateLimit: publicApiRateLimit, params: slugParams },
  async ({ params }) => {
    const billboard = await getBillboardBySlug(params.slug);
    if (!billboard) throw notFound("رسانه یافت نشد");
    return NextResponse.json(
      { billboard: toPublicBillboard(billboard) },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  },
);
