import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { decideListing } from "@/lib/db/listings";
import { LISTING_DECISIONS } from "@/lib/domain/listing";

const AUDIT_ACTION = {
  approve:  "listing_approved",
  reject:   "listing_rejected",
  revision: "listing_revision_requested",
} as const;

/**
 * POST /api/admin/listings/[id]/decision — approve, reject, or send back.
 *
 * admin+ only: publishing someone's paid listing is a money decision, not an
 * edit. `note` is required for reject and revision — a bare refusal helps no
 * one. The transitions are in decisionOutcome (lib/domain/listing.ts).
 */
export const POST = defineRoute(
  {
    name: "admin/listings/[id]/decision",
    access: { staff: "admin" },
    rateLimit: adminApiRateLimit,
    params: idParams,
    body: z.object({
      decision: z.enum(LISTING_DECISIONS),
      note:     z.string().trim().max(1000).optional(),
      // The listing's updatedAt as the reviewer saw it — see decideListing.
      seen:     z.string().datetime({ offset: true }),
    }).refine(
      d => d.decision === "approve" || !!d.note,
      { message: "برای رد کردن یا درخواست اصلاح، نوشتن توضیح برای فرستنده الزامی است", path: ["note"] },
    ),
    messages: { forbidden: "فقط ادمین می‌تواند آگهی را تأیید یا رد کند" },
  },
  async ({ params, body, audit }) => {
    const note = body.note || null;
    const { before, after } = await decideListing(params.id, body.decision, note, new Date(body.seen));
    await audit(AUDIT_ACTION[body.decision], {
      severity: "warn",
      details: {
        billboardId: params.id,
        from: before.moderation,
        to: after.moderation,
        plan: before.plan,
        featuredGranted: after.featured,
        submittedById: before.submittedById,
        ...(note ? { note } : {}),
      },
    });
    return NextResponse.json({ listing: after });
  },
);
