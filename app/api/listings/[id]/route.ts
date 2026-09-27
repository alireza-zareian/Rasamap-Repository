import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { many, UploadedFile } from "@/lib/http/form";
import { accountWriteRateLimit, userApiRateLimit } from "@/lib/rate-limit";
import { resubmitListing } from "@/lib/db/listings";
import { COORDINATES_TOGETHER, coordinatesTogether, ListingFieldsSchema, MAX_LISTING_IMAGES, maxUploadBodyBytes } from "@/lib/domain/listing";
import { faNum } from "@/lib/format";

/**
 * The resubmitted form. `photos` is the whole new photo list in order, each
 * entry either the address of a photo the listing already has (kept) or a new
 * file — one field, so the order the submitter chose survives.
 */
const ResubmissionForm = ListingFieldsSchema.extend({
  photos: many(z.union([z.string().min(1).max(300), UploadedFile]), MAX_LISTING_IMAGES, `حداکثر ${faNum(MAX_LISTING_IMAGES)} تصویر مجاز است`),
}).refine(coordinatesTogether, COORDINATES_TOGETHER);

/**
 * PATCH /api/listings/[id] — the submitter edits a listing an admin sent back
 * for revision, and resubmits it. The row re-enters the admin queue at its
 * plan's initial status.
 */
export const PATCH = defineRoute(
  {
    name: "listings/[id]",
    access: "customer",
    rateLimit: userApiRateLimit,
    params: idParams,
    form: ResubmissionForm,
    maxBodyBytes: maxUploadBodyBytes(MAX_LISTING_IMAGES),
  },
  async ({ actor, params, body, audit, tooMany }) => {
    // A resubmission carries photos too, so it shares the submission budget.
    const perAccount = await accountWriteRateLimit("listing", String(actor.id));
    if (!perAccount.allowed) return tooMany(perAccount);

    const { photos, ...fields } = body;
    const listing = await resubmitListing(actor, params.id, fields, photos);
    await audit("listing_resubmitted", {
      details: { billboardId: params.id, to: listing.moderation },
    });
    return NextResponse.json({ listing });
  },
);
