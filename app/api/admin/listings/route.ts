import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { pageQuery } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { listSubmissionQueue } from "@/lib/db/listings";

// GET /api/admin/listings — the approval queue. editor+ may look; only admin+
// may decide (see the decision route).
export const GET = defineRoute(
  {
    name: "admin/listings",
    access: { staff: "editor" },
    rateLimit: adminApiRateLimit,
    query: z.object({
      status: z.enum(["pending", "awaiting_payment", "needs_revision", ""]).default(""),
      ...pageQuery(50),
    }),
  },
  async ({ query }) => {
    const { status, page, limit } = query;
    return NextResponse.json(await listSubmissionQueue({ status: status || undefined, page, limit }));
  },
);
