// Seed deterministic fixtures into the test database.
// Reusable standalone: `npm run test:seed` (targets prisma/test.db unless DATABASE_URL says otherwise).

import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

process.env.DATABASE_URL ||= "file:./prisma/test.db";

if (process.env.DATABASE_URL.includes("dev.db")) {
  console.error("refusing to seed fixtures into the development database.");
  process.exit(1);
}

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** Billboard row with every NOT-NULL column filled; override what a test cares about. */
function billboard(overrides = {}) {
  return {
    name: "Test Billboard",
    slug: "test-billboard",
    location: "Test Street",
    region: "Region 1",
    city: "تهران",
    type: "billboard",
    status: "available",
    width: 12,
    height: 4,
    faces: 2,
    age: 3,
    price: 5000,
    priceWeekly: 1500,
    priceQuarterly: 13000,
    priceYearly: 45000,
    traffic: {
      daily: 50000,
      peakHour: "18:00",
      congestionLevel: 7,
      pedestrian: 8000,
      estimatedViews: 7500,
      viewabilityScore: 72,
    },
    mapX: 50,
    mapY: 50,
    icon: "location",
    hasImages: false,
    images: [],
    agency: "Test Agency",
    phone: "02100000000",
    description: "Fixture billboard for the test suite.",
    features: [],
    nearbyLandmarks: [],
    rating: 0,
    reviewCount: 0,
    ...overrides,
  };
}

async function main() {
  // Order matters: children before parents.
  await prisma.reservation.deleteMany();
  await prisma.review.deleteMany();
  await prisma.billboard.deleteMany();
  await prisma.user.deleteMany();

  for (const row of [
    billboard({ id: 1, name: "Valiasr Tower", slug: "valiasr-tower", city: "تهران", type: "billboard", status: "available", price: 8000 }),
    billboard({ id: 2, name: "Mashhad Digital", slug: "mashhad-digital", city: "مشهد", type: "digital", status: "available", price: 12000 }),
    billboard({ id: 3, name: "Inactive Board", slug: "inactive-board", city: "تهران", type: "billboard", status: "inactive", price: 3000 }),
  ]) {
    await prisma.billboard.create({ data: row });
  }

  const passwordHash = await bcrypt.hash("secret123", 12);
  await prisma.user.create({ data: { id: 1, name: "Ali Tester", phone: "09120000000", passwordHash } });
  await prisma.user.create({ data: { id: 2, name: "Sara Tester", phone: "09120000002", passwordHash } });

  console.log("seeded: 3 billboards, 2 users (password 'secret123')");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
