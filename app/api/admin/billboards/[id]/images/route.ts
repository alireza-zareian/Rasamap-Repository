import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { z } from "zod";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { prisma } from "@/lib/db/client";

const PutSchema = z.object({
  images: z.array(z.string().min(1)).max(10),
});

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;
const EXT_MAP: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// PUT /api/admin/billboards/[id]/images — editor+
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  if (!hasPermission(session.role, "editor")) {
    return NextResponse.json({ error: "دسترسی کافی ندارید" }, { status: 403 });
  }

  const rl = adminApiRateLimit(getClientIp(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });

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

  const finalUrls: string[] = [];
  const ts = Date.now();

  for (let i = 0; i < parsed.data.images.length; i++) {
    const src = parsed.data.images[i];
    const match = DATA_URL_RE.exec(src);
    if (match) {
      // New image as base64 data URL — write to filesystem
      const mime = match[1];
      const ext = EXT_MAP[mime] ?? "jpg";
      const filename = `${ts}-${i}.${ext}`;
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length > 5 * 1024 * 1024) {
        return NextResponse.json({ error: `تصویر ${i + 1} بزرگ‌تر از ۵MB است` }, { status: 400 });
      }
      await writeFile(join(dir, filename), buffer);
      finalUrls.push(`/uploads/billboards/${id}/${filename}`);
    } else if (src.startsWith("/") || src.startsWith("http")) {
      // Already a saved URL — keep as-is
      finalUrls.push(src);
    }
    // Silently skip invalid entries
  }

  const updated = await prisma.billboard.update({
    where: { id },
    data:  { images: finalUrls },
    select: { id: true, images: true },
  });

  return NextResponse.json({ images: updated.images }, { headers: { "Cache-Control": "no-store" } });
}
