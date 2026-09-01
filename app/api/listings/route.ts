import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { z } from "zod";
import { createListing } from "@/lib/db/billboards";
import { userApiRateLimit } from "@/lib/auth/rate-limit";

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
});

export async function POST(req: NextRequest) {
  const rl = userApiRateLimit(getClientIp(req));
  if (!rl.allowed) {
    return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است. لطفاً بعداً امتحان کنید." }, { status: 429 });
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

  const listing = await createListing(parsed.data);

  return NextResponse.json(
    { listing: { id: listing.id, name: listing.name, status: listing.status } },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
