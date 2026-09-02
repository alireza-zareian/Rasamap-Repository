import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { z } from "zod";
import { createListing, getListingsForUser, type ListingPlan } from "@/lib/db/billboards";
import { getSession } from "@/lib/auth/session";
import { userApiRateLimit } from "@/lib/auth/rate-limit";
import { rateLimited } from "@/lib/api-rate-limit";
import { idempotency } from "@/lib/idempotency";
import { saveImages, discardImages, MAX_LISTING_IMAGES, MAX_IMAGE_BYTES } from "@/lib/uploads";
import { serverError } from "@/lib/api-error";
import { withApiLog } from "@/lib/api-log";

// Base64 inflates by ~4/3, plus the JSON envelope. This bounds the request
// before the body is read into memory, so an oversized payload is refused
// rather than buffered and then rejected.
const MAX_BODY_BYTES = Math.ceil(MAX_LISTING_IMAGES * MAX_IMAGE_BYTES * 1.4) + 64 * 1024;

const ListingSchema = z.object({
  name:     z.string().min(3, "نام رسانه باید حداقل ۳ کاراکتر باشد").max(100),
  desc:     z.string().max(1000).optional().default(""),
  phone:    z.string().regex(/^09\d{9}$/, "شماره تماس معتبر نیست (مثال: 09123456789)"),
  type:     z.enum(["billboard", "digital", "bridge", "station"]),
  city:     z.string().min(1, "شهر الزامی است").max(50),
  region:   z.string().max(100).optional().default(""),
  location: z.string().max(200).optional().default(""),
  width:    z.coerce.number().int().positive("عرض باید عدد مثبت باشد").max(200),
  height:   z.coerce.number().int().positive("ارتفاع باید عدد مثبت باشد").max(200),
  faces:    z.coerce.number().int().min(1).max(12),
  price:    z.coerce.number().int().positive("قیمت باید عدد مثبت باشد").max(10_000),
  plan:     z.enum(["free", "featured"]).optional().default("free"),
  // Data URLs. Contents are validated in lib/uploads.ts — this only bounds the
  // count and the raw string length so a huge blob is rejected before decoding.
  images:   z.array(z.string().max(4_000_000)).max(MAX_LISTING_IMAGES).optional().default([]),
});

async function POSTHandler(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "برای ثبت رسانه باید وارد حساب کاربری خود شوید" }, { status: 401 });
  }

  // Shared helper so every rate-limited route answers the same way: a 429 with
  // a Retry-After header, a Persian wait message, and one audit row per lockout.
  const ip = getClientIp(req);
  const rl = userApiRateLimit(ip);
  if (!rl.allowed) {
    return rateLimited(rl, { endpoint: "listings", ip, userId: session.userId, userEmail: session.email });
  }

  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "حجم درخواست بیش از حد مجاز است" }, { status: 413 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }

  const parsed = ListingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" },
      { status: 400 },
    );
  }

  const userId = parseInt(session.userId, 10);
  const idem = await idempotency(req, userId, "listings");
  if ("error" in idem) return NextResponse.json({ error: idem.error }, { status: 409 });
  if (idem.replay) {
    return NextResponse.json(idem.replay.body, { status: idem.replay.status, headers: { "Cache-Control": "no-store" } });
  }

  const { images, plan, ...fields } = parsed.data;

  // Files land on disk first so a rejected image never creates a half-listing;
  // if the row then fails to write, the folder is removed again.
  const saved = await saveImages("listings", images);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });

  let responseBody: { listing: { id: number; name: string; status: string; plan: string } };
  try {
    const listing = await createListing({
      ...fields,
      plan: plan as ListingPlan,
      images: saved.urls,
      submittedById: userId,
    });
    responseBody = {
      listing: { id: listing.id, name: listing.name, status: listing.status, plan },
    };
  } catch (e) {
    await discardImages(saved.dir);
    // The partial unique index on (submittedById, name, city) is the DB-level
    // floor under the opt-in Idempotency-Key: a double-click or a retry without
    // the header loses the race here instead of creating a second listing.
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        { error: "این رسانه را قبلاً ثبت کرده‌اید. وضعیت آن را در داشبورد ببینید." },
        { status: 409 },
      );
    }
    return serverError("POST /api/listings", e, { userId: session.userId });
  }

  await idem.save?.(201, responseBody);
  return NextResponse.json(responseBody, { status: 201, headers: { "Cache-Control": "no-store" } });
}

// GET /api/listings — the signed-in user's own submissions and their state.
async function GETHandler() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  const userId = parseInt(session.userId, 10);
  if (Number.isNaN(userId)) {
    return NextResponse.json({ error: "نشست نامعتبر است" }, { status: 401 });
  }

  const rows = await getListingsForUser(userId);

  return NextResponse.json(
    {
      listings: rows.map(r => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        city: r.city,
        type: r.type,
        price: r.price,
        status: r.status,
        plan: r.plan,
        featured: r.featured,
        image: (r.images as string[])?.[0] ?? null,
        createdAt: r.createdAt,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET  = withApiLog("listings", GETHandler);
export const POST = withApiLog("listings", POSTHandler);
