import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { many, UploadedFile } from "@/lib/http/form";
import { accountWriteRateLimit, userApiRateLimit } from "@/lib/rate-limit";
import { resubmitListing } from "@/lib/db/listings";
import { COORDINATES_TOGETHER, coordinatesTogether, ListingFieldsSchema, MAX_LISTING_IMAGES, maxUploadBodyBytes } from "@/lib/domain/listing";
import { faNum } from "@/lib/format";

/** `photos` is the new list in order: kept addresses and new files in one field, so the order survives. */
const ResubmissionForm = ListingFieldsSchema.extend({
  photos: many(z.union([z.string().min(1).max(300), UploadedFile]), MAX_LISTING_IMAGES, `حداکثر ${faNum(MAX_LISTING_IMAGES)} تصویر مجاز است`),
}).refine(coordinatesTogether, COORDINATES_TOGETHER);

/** PATCH /api/listings/[id] — the submitter edits and resubmits a listing sent back for revision. */
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
