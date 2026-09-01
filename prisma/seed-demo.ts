/**
 * Demo seed — creates a demo user + realistic reservations for thesis presentation.
 * Safe to run repeatedly (upserts by phone).
 *
 * Usage:  npm run db:seed:demo
 * Demo credentials:  phone 09123456789  |  password demo1234
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DEMO_PHONE    = "09123456789";
const DEMO_PASSWORD = "demo1234";
const DEMO_NAME     = "علی رضایی";

function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // Upsert demo user
  const user = await prisma.user.upsert({
    where: { phone: DEMO_PHONE },
    update: { passwordHash, name: DEMO_NAME },
    create: { phone: DEMO_PHONE, passwordHash, name: DEMO_NAME },
  });
  console.log(`✅ Demo user: #${user.id} — ${DEMO_NAME} (${DEMO_PHONE})`);

  // Clear existing demo reservations for idempotency
  await prisma.reservation.deleteMany({ where: { userId: user.id } });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 6 realistic reservations across different billboards + statuses
  const seeds = [
    { billboardId: 1,  startDate: addDays(today,  3), endDate: addDays(today, 17), status: "confirmed" },
    { billboardId: 2,  startDate: addDays(today, 10), endDate: addDays(today, 40), status: "pending"   },
    { billboardId: 5,  startDate: addDays(today, -30), endDate: addDays(today, -2), status: "confirmed" },
    { billboardId: 8,  startDate: addDays(today, -60), endDate: addDays(today, -31), status: "confirmed" },
    { billboardId: 10, startDate: addDays(today, 20), endDate: addDays(today, 50), status: "pending"   },
    { billboardId: 20, startDate: addDays(today, -15), endDate: addDays(today, -10), status: "cancelled" },
  ];

  for (const s of seeds) {
    const r = await prisma.reservation.create({
      data: { userId: user.id, ...s },
      include: { billboard: { select: { name: true, city: true } } },
    });
    console.log(`  📋 #${r.id} ${r.status.padEnd(9)} ${r.billboard.city} — ${r.billboard.name.slice(0, 40)}`);
  }

  // Mark the confirmed future billboard as reserved
  await prisma.billboard.update({ where: { id: 1 }, data: { status: "reserved" } });
  console.log("\n✅ Billboard #1 marked as reserved");

  console.log(`\n🎯 Demo credentials:\n   phone:    ${DEMO_PHONE}\n   password: ${DEMO_PASSWORD}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
