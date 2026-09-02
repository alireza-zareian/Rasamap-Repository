import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getClientIp } from "@/lib/auth/client-ip";
import { userApiRateLimit } from "@/lib/auth/rate-limit";
import { getBillboardBySlug } from "@/lib/db/billboards";
import { serverError } from "@/lib/api-error";
import { withApiLog } from "@/lib/api-log";

const slugSchema = z.string().min(1).max(120).regex(/^[a-z0-9-]+$/);

// GET /api/billboards/[slug]/contact — the owner/agency phone number.
// Signed-in users only: the number is kept out of every public response so it
// can't be scraped from the site.
async function getHandler(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "برای دیدن اطلاعات تماس باید وارد حساب کاربری شوید" }, { status: 401 });
  }

  const rl = userApiRateLimit(getClientIp(req));
  if (!rl.allowed) {
    return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });
  }

  const { slug } = await params;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }

  try {
    const billboard = await getBillboardBySlug(parsed.data);
    if (!billboard) {
      return NextResponse.json({ error: "رسانه یافت نشد" }, { status: 404 });
    }
    const phone = billboard.phone && billboard.phone !== "—" ? billboard.phone.trim() : "";
    return NextResponse.json(
      { phone, agency: billboard.agency ?? "" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return serverError("GET /api/billboards/[slug]/contact", err, { slug });
  }
}

export const GET = withApiLog("billboards/[slug]/contact", getHandler);
