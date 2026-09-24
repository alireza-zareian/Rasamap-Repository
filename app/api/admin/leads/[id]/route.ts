import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { updateLead } from "@/lib/db/leads";
import { LEAD_STATUSES } from "@/lib/types";

// PATCH /api/admin/leads/[id] — follow-up state and internal memo (editor+).
export const PATCH = defineRoute(
  {
    name: "admin/leads/[id]",
    access: { staff: "editor" },
    rateLimit: adminApiRateLimit,
    params: idParams,
    body: z
      .object({
        status: z.enum(LEAD_STATUSES).optional(),
        // "" clears the memo; the field is optional so a status-only PATCH keeps it.
        note:   z.string().max(500).trim().optional(),
      })
      .refine(d => d.status !== undefined || d.note !== undefined, { message: "تغییری ارسال نشده" }),
  },
  async ({ params, body, audit }) => {
    const { before, lead } = await updateLead(params.id, body);
    await audit("lead_update", {
      // No phone or name here — the log records which lead moved, not who it is.
      details: { leadId: params.id, billboardId: before.billboardId, from: before.status, to: lead.status, noteChanged: body.note !== undefined },
    });
    return NextResponse.json({ lead });
  },
);
