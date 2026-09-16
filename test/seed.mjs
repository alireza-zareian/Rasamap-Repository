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
/**
 * Fixtures for the radial search, laid out so the assertions can be exact.
 *
 * Centre is Valiasr/Vanak in Tehran. One row sits about 1 km away, one about
 * 8 km, and one has no coordinates at all — which is 15% of the real dataset
 * and therefore the case most likely to be forgotten.
 */
export const NEAR_CENTRE = { lat: 35.7580, lng: 51.4100 };

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
  await prisma.auditLog.deleteMany();
  await prisma.admin.deleteMany();

  const passwordHash = await bcrypt.hash("secret123", 12);
  await prisma.user.create({ data: { id: 1, name: "Ali Tester", phone: "09120000000", passwordHash } });
  await prisma.user.create({ data: { id: 2, name: "Sara Tester", phone: "09120000002", passwordHash } });
  // Reserved for the timing-oracle probe. It needs an account that really
  // exists and whose per-account sign-in budget nothing else has spent — the
  // budget follows the account now, so sharing a phone number across tests
  // makes one test's failures another test's 429.
  await prisma.user.create({ data: { id: 3, name: "Timing Probe", phone: "09120000004", passwordHash } });

  // Staff accounts, one per role.
  //
  // These used to be absent, and every admin test minted a JWT for an id that
  // had no row behind it. That passed for as long as nothing looked — but a
  // session is only as good as the account it names, and the route that checks
  // it (getStaffSession) reads the row to see whether the account is still
  // active and still holds the role the token claims. A fabricated session is
  // therefore not a session any more, and rightly so: one could never have
  // existed in production, where the only way to hold a staff token is to have
  // signed in against one of these rows.
  //
  // The ids are the defaults mintSession() hands out per role — see
  // test/helpers.mjs — so `mintSession({ role: "editor" })` names this editor.
  for (const [id, role] of [[9001, "viewer"], [9002, "editor"], [9003, "admin"], [9004, "super_admin"]]) {
    await prisma.admin.create({
      data: { id, email: `${role}@test.local`, passwordHash, name: `Test ${role}`, role, active: true },
    });
  }
  // Three more super_admins, because the user-management tests need actors that
  // are distinct from each other and from the account they are editing (one of
  // them checks that a super_admin cannot change its own role).
  for (const id of [99001, 99002, 99003]) {
    await prisma.admin.create({
      data: { id, email: `super${id}@test.local`, passwordHash, name: `Test super ${id}`, role: "super_admin", active: true },
    });
  }
  // Deactivated on purpose: proof that a valid token for a disabled account is
  // refused. Nothing else touches it.
  await prisma.admin.create({
    data: { id: 9005, email: "revoked@test.local", passwordHash, name: "Test revoked", role: "admin", active: false },
  });

  for (const row of [
    // Distinct estimatedViews / area so the sort tests can assert a real order.
    billboard({ id: 1, name: "Valiasr Tower",   slug: "valiasr-tower",   city: "تهران", type: "billboard", status: "available", price: 8000,  views: 9000, width: 20, height: 5 }),
    billboard({ id: 2, name: "Mashhad Digital", slug: "mashhad-digital", city: "مشهد",  type: "digital",   status: "available", price: 12000, views: 3000, width: 6,  height: 3 }),
    billboard({ id: 3, name: "Inactive Board",  slug: "inactive-board",  city: "تهران", type: "billboard", status: "inactive",  price: 3000,  views: 500,  width: 4,  height: 2 }),
    // ── Radial-search fixtures ──
    billboard({ id: 90, name: "Near Centre",  slug: "near-centre",  city: "تهران", status: "available", price: 6000, lat: 35.7590, lng: 51.4110 }),  // ~0.15 km
    billboard({ id: 91, name: "Just Outside", slug: "just-outside", city: "تهران", status: "available", price: 6100, lat: 35.8300, lng: 51.4100 }),  // ~8 km
    billboard({ id: 92, name: "No Coords",    slug: "no-coords",    city: "تهران", status: "available", price: 6200 }),                              // lat/lng null
    // Submission-pipeline fixtures: neither may appear in any public read.
    billboard({ id: 4, name: "Pending Listing", slug: "pending-listing", city: "تهران", type: "billboard", status: "pending", price: 100, source: "listing", submittedById: 1 }),
    billboard({ id: 5, name: "Unpaid Listing",  slug: "unpaid-listing",  city: "تهران", type: "digital",   status: "awaiting_payment", plan: "featured", price: 200, source: "listing", submittedById: 1 }),
    // Has an image, so the analytics coverage count has something to find.
    billboard({ id: 6, name: "Photo Board", slug: "photo-board", city: "شیراز", type: "billboard", status: "available", price: 4000, views: 6000, width: 10, height: 3, hasImages: true, images: ["/uploads/test/1.jpg"] }),
  ]) {
    await prisma.billboard.create({ data: row });
  }

  console.log("seeded: 6 billboards (2 unpublished, 1 with an image), 3 users, 8 admins (password 'secret123')");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
