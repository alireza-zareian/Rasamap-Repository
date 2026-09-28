import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { pageQuery } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { listLeads } from "@/lib/db/leads";
import { LEAD_STATUSES } from "@/lib/types";

/**
 * GET /api/admin/leads — leads with a count per follow-up state. Editor and
 * above, who already see submitters' phones in the listings queue.
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
