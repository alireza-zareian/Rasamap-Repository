import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { pageQuery } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { listLeads } from "@/lib/db/leads";
import { LEAD_STATUSES } from "@/lib/types";

/**
 * GET /api/admin/leads — the demand side of the marketplace, with the counts
 * per follow-up state so the panel needs no second request. editor+ may read:
 * the listings queue already shows a submitter's phone to the same roles.
 */
export const GET = defineRoute(
  {
    name: "admin/leads",
    access: { staff: "editor" },
    rateLimit: adminApiRateLimit,
    query: z.object({
      status: z.enum(LEAD_STATUSES).or(z.literal("")).default(""),
      ...pageQuery(50),
    }),
  },
  async ({ query }) => {
    const { status, page, limit } = query;
    return NextResponse.json(await listLeads({ status: status || undefined, page, limit }));
  },
);
