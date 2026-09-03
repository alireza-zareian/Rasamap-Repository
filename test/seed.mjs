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

/**
 * Billboard row with every NOT-NULL column filled; override what a test cares
 * about. `views` keeps traffic.estimatedViews and the denormalised
 * estimatedViews column in step — a fixture where they disagree would let a
 * sort test pass while sorting on the wrong thing.
 */
function billboard({ views = 7500, width = 12, height = 4, ...overrides } = {}) {
  return {
    name: "Test Billboard",
    slug: "test-billboard",
    location: "Test Street",
    region: "Region 1",
    city: "تهران",
    type: "billboard",
    status: "available",
    faces: 2,
    age: 3,
    price: 5000,
    priceWeekly: 1500,
    priceQuarterly: 13000,
    priceYearly: 45000,
    width,
    height,
    traffic: {
      daily: 50000,
      peakHour: "18:00",
      congestionLevel: 7,
      pedestrian: 8000,
      estimatedViews: views,
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
    area: width * height,
    estimatedViews: views,
    plan: "free",
    featured: false,
    ...overrides,
  };
}

async function main() {
  // Order matters: children before parents.
  await prisma.contactRequest.deleteMany();
  await prisma.review.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.billboard.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("secret123", 12);
  await prisma.user.create({ data: { id: 1, name: "Ali Tester", phone: "09120000000", passwordHash } });
  await prisma.user.create({ data: { id: 2, name: "Sara Tester", phone: "09120000002", passwordHash } });

  for (const row of [
    // Distinct estimatedViews / area so the sort tests can assert a real order.
    billboard({ id: 1, name: "Valiasr Tower",   slug: "valiasr-tower",   city: "تهران", type: "billboard", status: "available", price: 8000,  views: 9000, width: 20, height: 5 }),
    billboard({ id: 2, name: "Mashhad Digital", slug: "mashhad-digital", city: "مشهد",  type: "digital",   status: "available", price: 12000, views: 3000, width: 6,  height: 3 }),
    billboard({ id: 3, name: "Inactive Board",  slug: "inactive-board",  city: "تهران", type: "billboard", status: "inactive",  price: 3000,  views: 500,  width: 4,  height: 2 }),
    // Submission-pipeline fixtures: neither may appear in any public read.
    billboard({ id: 4, name: "Pending Listing", slug: "pending-listing", city: "تهران", type: "billboard", status: "pending", price: 100, source: "listing", submittedById: 1 }),
    billboard({ id: 5, name: "Unpaid Listing",  slug: "unpaid-listing",  city: "تهران", type: "digital",   status: "awaiting_payment", plan: "featured", price: 200, source: "listing", submittedById: 1 }),
    // Has an image, so the analytics coverage count has something to find.
    billboard({ id: 6, name: "Photo Board", slug: "photo-board", city: "شیراز", type: "billboard", status: "available", price: 4000, views: 6000, width: 10, height: 3, hasImages: true, images: ["/uploads/test/1.jpg"] }),
  ]) {
    await prisma.billboard.create({ data: row });
  }

  console.log("seeded: 6 billboards (2 unpublished, 1 with an image), 2 users (password 'secret123')");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
