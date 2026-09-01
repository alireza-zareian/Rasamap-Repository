import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { withApiLog } from "@/lib/api-log";

async function GETHandler() {
  const session = await getSession();
  if (!session || session.role !== "user") {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  const userId = parseInt(session.userId, 10);
  const reservations = await prisma.reservation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      billboard: { select: { id: true, name: true, city: true, type: true, price: true, slug: true, images: true } },
    },
  });

  return NextResponse.json(
    {
      reservations: reservations.map(r => ({
        id:            r.id,
        billboardId:   r.billboardId,
        billboardSlug: r.billboard.slug,
        billboardName: r.billboard.name,
        billboardCity: r.billboard.city,
        billboardType: r.billboard.type,
        billboardImage: (r.billboard.images as string[])?.[0] ?? null,
        price:         r.billboard.price,
        startDate:     r.startDate,
        endDate:       r.endDate,
        status:        r.status,
        createdAt:     r.createdAt,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export const GET = withApiLog("reservations/my", GETHandler);
