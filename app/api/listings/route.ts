import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { userApiRateLimit } from "@/lib/rate-limit";
import { idempotency } from "@/lib/db/idempotency";
import { listOwnListings, submitListing } from "@/lib/db/listings";
import { ListingInputSchema, MAX_LISTING_IMAGES } from "@/lib/domain/listing";
import { maxUploadBodyBytes } from "@/lib/uploads";

// POST /api/listings — a customer submits a media item for review.
export const POST = defineRoute(
  {
    name: "listings",
    access: "customer",
    rateLimit: userApiRateLimit,
    body: ListingInputSchema,
    maxBodyBytes: maxUploadBodyBytes(MAX_LISTING_IMAGES),
    messages: { signedOut: "برای ثبت رسانه باید وارد حساب کاربری خود شوید" },
  },
  async ({ req, actor, body }) => {
    const idem = await idempotency(req.headers.get("idempotency-key"), actor.id, "listings");
    if ("error" in idem) return NextResponse.json({ error: idem.error }, { status: idem.status });
    if ("replay" in idem) return NextResponse.json(idem.replay.body, { status: idem.replay.status });

    let listing;
    try {
      listing = await submitListing(actor, body);
    } catch (err) {
      // A refused submission leaves the key free, so the same form can retry.
      await idem.claim?.release();
      throw err;
    }
    const responseBody = { listing };
    await idem.claim?.save(201, responseBody);
    return NextResponse.json(responseBody, { status: 201 });
  },
);

// GET /api/listings — the signed-in customer's own submissions and their state.
export const GET = defineRoute(
  { name: "listings", access: "customer", rateLimit: userApiRateLimit },
  async ({ actor }) => NextResponse.json({ listings: await listOwnListings(actor) }),
);
