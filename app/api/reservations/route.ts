import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { userApiRateLimit } from "@/lib/auth/rate-limit";

function getIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

const ReservationSchema = z.object({
  billboardId: z.number().int().positive(),
  startDate:   z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate:     z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  note:        z.string().max(500).optional(),
});

// GET /api/reservations?billboardId=X — public, returns booked date ranges
export async function GET(req: NextRequest) {
  const billboardId = parseInt(req.nextUrl.searchParams.get("billboardId") ?? "", 10);
  if (isNaN(billboardId)) return NextResponse.json({ error: "billboardId الزامی است" }, { status: 400 });

  const reservations = await prisma.reservation.findMany({
    where: {
      billboardId,
      status: { not: "cancelled" },
      endDate: { gte: new Date() },
    },
    select: { startDate: true, endDate: true, status: true },
    orderBy: { startDate: "asc" },
  });

  return NextResponse.json({ reservations }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/reservations — requires user auth
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "user") {
    return NextResponse.json({ error: "برای رزرو باید وارد حساب کاربری خود شوید" }, { status: 401 });
  }

  const rl = userApiRateLimit(getIP(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 }); }

  const parsed = ReservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر" }, { status: 400 });
  }

  const { billboardId, startDate: startStr, endDate: endStr, note } = parsed.data;

  const startDate = new Date(startStr);
  const endDate   = new Date(endStr);

  if (startDate >= endDate) {
    return NextResponse.json({ error: "تاریخ پایان باید بعد از تاریخ شروع باشد" }, { status: 400 });
  }
  if (startDate < new Date()) {
    return NextResponse.json({ error: "تاریخ شروع نمی‌تواند در گذشته باشد" }, { status: 400 });
  }

  // Verify billboard exists
  const billboard = await prisma.billboard.findUnique({ where: { id: billboardId }, select: { id: true, name: true, status: true } });
  if (!billboard) return NextResponse.json({ error: "بیلبورد یافت نشد" }, { status: 404 });
  if (billboard.status === "inactive") {
    return NextResponse.json({ error: "این رسانه در حال حاضر فعال نیست" }, { status: 409 });
  }

  const userId = parseInt(session.userId, 10);
  // Wrap overlap check + create in a single transaction to prevent TOCTOU race
  let reservation: Awaited<ReturnType<typeof prisma.reservation.create>> & { billboard: { name: string; city: string } };
  try {
    reservation = await prisma.$transaction(async (tx) => {
      const overlap = await tx.reservation.count({
        where: {
          billboardId,
          status: { not: "cancelled" },
          startDate: { lt: endDate },
          endDate:   { gt: startDate },
        },
      });
      if (overlap > 0) throw new Error("OVERLAP");
      return tx.reservation.create({
        data: { billboardId, userId, startDate, endDate, status: "pending" },
        include: { billboard: { select: { name: true, city: true } } },
      });
    });
  } catch (e) {
    if ((e as Error).message === "OVERLAP") {
      return NextResponse.json({ error: "این بازه زمانی قبلاً رزرو شده است. لطفاً تاریخ دیگری انتخاب کنید." }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json(
    {
      reservation: {
        id:         reservation.id,
        billboardId: reservation.billboardId,
        billboardName: reservation.billboard.name,
        billboardCity: reservation.billboard.city,
        startDate:  reservation.startDate,
        endDate:    reservation.endDate,
        status:     reservation.status,
        note,
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
