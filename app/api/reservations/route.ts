import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { userApiRateLimit } from "@/lib/auth/rate-limit";
import { serverError } from "@/lib/api-error";
import { idempotency } from "@/lib/idempotency";
import { withApiLog } from "@/lib/api-log";

const ReservationSchema = z.object({
  billboardId: z.number().int().positive(),
  startDate:   z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate:     z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  note:        z.string().max(500).optional(),
});

// GET /api/reservations?billboardId=X — public, returns booked date ranges
async function GETHandler(req: NextRequest) {
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
async function POSTHandler(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "user") {
    return NextResponse.json({ error: "برای رزرو باید وارد حساب کاربری خود شوید" }, { status: 401 });
  }

  const rl = userApiRateLimit(getClientIp(req));
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

  // Opt-in Idempotency-Key: replay a stored response for a repeated key.
  const idem = await idempotency(req, userId, "reservations");
  if ("error" in idem) return NextResponse.json({ error: idem.error }, { status: 409 });
  if (idem.replay) {
    return NextResponse.json(idem.replay.body, { status: idem.replay.status, headers: { "Cache-Control": "no-store" } });
  }

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
    // DB-level unique (billboardId,userId,startDate,endDate) — an exact duplicate
    // that slipped past the overlap count under concurrency.
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "این رزرو قبلاً ثبت شده است." }, { status: 409 });
    }
    return serverError("POST /api/reservations", e, { userId: session.userId, billboardId });
  }

  const responseBody = {
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
  };
  await idem.save?.(201, responseBody);

  return NextResponse.json(responseBody, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiLog("reservations", GETHandler);
export const POST = withApiLog("reservations", POSTHandler);
