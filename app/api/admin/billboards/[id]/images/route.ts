import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { z } from "zod";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { prisma } from "@/lib/db/client";
import { decodeImageDataUrl, MAX_IMAGE_BYTES } from "@/lib/uploads";
import { withApiLog } from "@/lib/api-log";

const MAX_ADMIN_IMAGES = 10;

const PutSchema = z.object({
  images: z.array(z.string().min(1)).max(MAX_ADMIN_IMAGES),
});

// PUT /api/admin/billboards/[id]/images — editor+
async function PUTHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  if (!hasPermission(session.role, "editor")) {
    return NextResponse.json({ error: "دسترسی کافی ندارید" }, { status: 403 });
  }

  const rl = adminApiRateLimit(getClientIp(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });

  // Bound the body before reading it, so a huge payload is refused rather than
  // buffered into memory just to be rejected later. Base64 inflates by ~4/3.
  const MAX_BODY = Math.ceil(MAX_ADMIN_IMAGES * MAX_IMAGE_BYTES * 1.4) + 64 * 1024;
  if (Number(req.headers.get("content-length")) > MAX_BODY) {
    return NextResponse.json({ error: "حجم درخواست بیش از حد مجاز است" }, { status: 413 });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (isNaN(id) || id <= 0) return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });

  const existing = await prisma.billboard.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "بیلبورد یافت نشد" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
  }

  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }

  const dir = join(process.cwd(), "public", "uploads", "billboards", String(id));
  await mkdir(dir, { recursive: true });

  // The payload mixes two kinds of entry: URLs already on the record (kept
  // untouched) and newly picked files as data URLs (validated, then written).
  const finalUrls: string[] = [];
  const ts = Date.now();

  for (let i = 0; i < parsed.data.images.length; i++) {
    const src = parsed.data.images[i];

    if (src.startsWith("/") || src.startsWith("http")) {
      finalUrls.push(src);        // already saved — keep as-is
      continue;
    }

    // Same validation as the public listing upload: type is decided by the
    // file's magic bytes, not by what the client declared. See lib/uploads.ts.
    const decoded = decodeImageDataUrl(src, i);
    if (!decoded.ok) {
      return NextResponse.json({ error: decoded.error }, { status: 400 });
    }
    const filename = `${ts}-${i}.${decoded.image.ext}`;
    await writeFile(join(dir, filename), decoded.image.buffer);
    finalUrls.push(`/uploads/billboards/${id}/${filename}`);
  }

  // `hasImages` is a denormalised flag: it is the first key of the default
  // ordering on every public listing and drives the analytics coverage count,
  // so it has to move with `images` or the two drift apart.
  const updated = await prisma.billboard.update({
    where: { id },
    data:  { images: finalUrls, hasImages: finalUrls.length > 0 },
    select: { id: true, images: true },
  });

  return NextResponse.json({ images: updated.images }, { headers: { "Cache-Control": "no-store" } });
}

export const PUT = withApiLog("admin/billboards/[id]/images", PUTHandler);
