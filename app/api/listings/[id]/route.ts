import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { idParams } from "@/lib/http/params";
import { userApiRateLimit } from "@/lib/rate-limit";
import { resubmitListing } from "@/lib/db/listings";
import { ListingInputSchema, MAX_LISTING_IMAGES } from "@/lib/domain/listing";
import { maxUploadBodyBytes } from "@/lib/uploads";

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
    body: ListingInputSchema,
    maxBodyBytes: maxUploadBodyBytes(MAX_LISTING_IMAGES),
  },
  async ({ actor, params, body, audit }) => {
    const listing = await resubmitListing(actor, params.id, body);
    await audit("listing_resubmitted", {
      details: { billboardId: params.id, to: listing.moderation },
    });
    return NextResponse.json({ listing });
  },
);
