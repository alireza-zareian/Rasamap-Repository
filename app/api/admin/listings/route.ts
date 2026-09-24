import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { pageQuery } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { listSubmissionQueue } from "@/lib/db/listings";
import { UNDECIDED } from "@/lib/domain/billboard";

// GET /api/admin/listings — the approval queue. editor+ may look; only admin+
// may decide (see the decision route).
export const GET = defineRoute(
  {
    name: "admin/listings",
    access: { staff: "editor" },
    rateLimit: adminApiRateLimit,
    query: z.object({
      moderation: z.enum(UNDECIDED).or(z.literal("")).default(""),
      ...pageQuery(50),
    }),
  },
  async ({ query }) => {
    const { moderation, page, limit } = query;
    return NextResponse.json(await listSubmissionQueue({ moderation: moderation || undefined, page, limit }));
  },
);
