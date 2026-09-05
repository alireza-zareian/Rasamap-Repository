import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { resubmitListing, type ListingPlan } from "@/lib/db/billboards";
import { getSession } from "@/lib/auth/session";
import { userApiRateLimit } from "@/lib/auth/rate-limit";
import { rateLimited } from "@/lib/api-rate-limit";
import { persistAudit } from "@/lib/auth/audit";
import { saveImages, discardImages, MAX_LISTING_IMAGES, MAX_IMAGE_BYTES } from "@/lib/uploads";
import { serverError } from "@/lib/api-error";
import { withApiLog } from "@/lib/api-log";
import { faNum } from "@/lib/format";

// Mirrors the create bound in app/api/listings/route.ts: enough headroom for a
// full set of images plus the JSON envelope, refused before the body is read.
const MAX_BODY_BYTES = Math.ceil(MAX_LISTING_IMAGES * MAX_IMAGE_BYTES * 1.4) + 64 * 1024;

// Same field set as the create schema. `images` may mix already-stored public
// URLs (kept photos) with fresh `data:` URLs (newly picked) — the handler
// splits them.
const EditSchema = z.object({
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
  images:   z.array(z.string().max(4_000_000)).max(MAX_LISTING_IMAGES).optional().default([]),
});

/**
 * PATCH /api/listings/[id] — the submitter edits a listing an admin sent back
 * for revision, and resubmits it.
 *
 * Only the account that submitted the row, and only while it is still in
 * `needs_revision`, may do this (enforced here and again in resubmitListing).
 * The row re-enters the admin queue at its plan's initial status.
 */
async function PATCHHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rl = userApiRateLimit(ip);
  if (!rl.allowed) {
    return rateLimited(rl, { endpoint: "listings/[id]", ip, userId: session.userId, userEmail: session.email });
  }

  const userId = parseInt(session.userId, 10);
  if (Number.isNaN(userId)) {
    return NextResponse.json({ error: "نشست نامعتبر است" }, { status: 401 });
  }

  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (Number.isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }

  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "حجم درخواست بیش از حد مجاز است" }, { status: 413 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }

  const parsed = EditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" },
      { status: 400 },
    );
  }

  // Ownership and state gate before any disk work. The image whitelist below
  // also needs the row's current photos.
  const current = await prisma.billboard.findUnique({
    where:  { id },
    select: { submittedById: true, status: true, images: true },
  });
  if (!current || current.submittedById !== userId) {
    return NextResponse.json({ error: "آگهی یافت نشد" }, { status: 404 });
  }
  if (current.status !== "needs_revision") {
    return NextResponse.json(
      { error: "این آگهی در وضعیت «نیاز به اصلاح» نیست و قابل ویرایش نیست" },
      { status: 409 },
    );
  }

  const { images, plan, ...fields } = parsed.data;
  const currentUrls = (current.images as string[]) ?? [];
  // A kept photo has to be one of this listing's own current URLs — never an
  // arbitrary string a client sends. Fresh photos arrive as data: URLs.
  const kept  = images.filter(s => !s.startsWith("data:") && currentUrls.includes(s));
  const fresh = images.filter(s => s.startsWith("data:"));
  if (kept.length + fresh.length > MAX_LISTING_IMAGES) {
    return NextResponse.json(
      { error: `حداکثر ${faNum(MAX_LISTING_IMAGES)} تصویر مجاز است` },
      { status: 400 },
    );
  }

  const saved = fresh.length
    ? await saveImages("listings", fresh)
    : { ok: true as const, urls: [] as string[], dir: "" };
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });

  let updated;
  try {
    updated = await resubmitListing(id, userId, {
      ...fields,
      plan: plan as ListingPlan,
      images: [...kept, ...saved.urls],
    });
  } catch (e) {
    await discardImages(saved.dir);
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        { error: "این نام و شهر با آگهی دیگری از شما هم‌خوانی دارد" },
        { status: 409 },
      );
    }
    return serverError("PATCH /api/listings/[id]", e, { userId: session.userId });
  }

  if (!updated) {
    await discardImages(saved.dir);
    return NextResponse.json({ error: "این آگهی قابل ویرایش نیست" }, { status: 409 });
  }

  await persistAudit({
    action: "listing_resubmitted",
    severity: "info",
    userEmail: session.email,
    ip,
    userAgent: req.headers.get("user-agent"),
    details: { billboardId: id, submittedById: userId, to: updated.status },
  });

  return NextResponse.json(
    {
      listing: {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        city: updated.city,
        type: updated.type,
        price: updated.price,
        status: updated.status,
        plan: updated.plan,
        featured: updated.featured,
        image: updated.images?.[0] ?? null,
        images: updated.images ?? [],
        description: updated.description,
        phone: updated.phone,
        region: updated.region,
        location: updated.location,
        width: updated.width,
        height: updated.height,
        faces: updated.faces,
        reviewNote: null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const PATCH = withApiLog("listings/[id]", PATCHHandler);
