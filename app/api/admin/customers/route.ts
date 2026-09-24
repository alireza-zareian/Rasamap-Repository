import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { pageQuery } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { CUSTOMER_SORTS, listCustomers } from "@/lib/db/customers";

// GET /api/admin/customers — the registered customer directory (admin+).
export const GET = defineRoute(
  {
    name: "admin/customers",
    access: { staff: "admin" },
    rateLimit: adminApiRateLimit,
    query: z.object({
      q:    z.string().trim().max(80).default(""),
      sort: z.enum(CUSTOMER_SORTS).default("created_desc"),
      ...pageQuery(100),
    }),
  },
  async ({ query }) => NextResponse.json(
    await listCustomers({ search: query.q, sort: query.sort, page: query.page, limit: query.limit }),
  ),
);
