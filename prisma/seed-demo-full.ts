/**
 * Full demo dataset — a broad, realistic set of accounts and records for a
 * live presentation and for manual API testing.
 *
 *   npm run db:seed:demo:full
 *
 * Idempotent: every record is upserted on a natural key (phone / email / a
 * scoped delete-then-recreate for the demo listings), so re-running it does not
 * create duplicates. Demo-only records are tagged "[DEMO]" in visible text.
 * Refuses to run against the test database. Password for every demo account: demo1234
 *
 * The account list it prints is also kept in docs/demo-accounts.md.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL ?? "";
if (!url || url.includes("test.db")) {
  console.error("Refusing to run: DATABASE_URL is empty or points at the test database.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

const PASSWORD = "demo1234";
const TAG = "[DEMO]";

// ── Users: one per meaningful state a reviewer might click into ─────────
const USERS = [
  { key: "publisher", phone: "09120000101", name: "سارا محمدی",  note: "two published listings + a review" },
  { key: "waiting",   phone: "09120000102", name: "رضا کریمی",   note: "one listing awaiting admin review" },
  { key: "new",       phone: "09120000103", name: "نگار احمدی",  note: "just signed up — nothing submitted" },
  { key: "rejected",  phone: "09120000104", name: "امیر حسینی",  note: "one rejected listing" },
  { key: "reviewer",  phone: "09120000105", name: "مریم رستمی",  note: "wrote a review, no listings" },
  { key: "paying",    phone: "09120000106", name: "کاوه نادری",  note: "featured plan, awaiting payment confirmation" },
  { key: "featured",  phone: "09120000107", name: "لیلا صادقی",  note: "featured listing, payment confirmed" },
  { key: "agency",    phone: "09120000108", name: "بابک تهرانی", note: "agency owner with several listings" },
] as const;

const ADMINS = [
  { email: "viewer@rasamap.demo",     name: `${TAG} ناظر`,        role: "viewer" },
  { email: "editor@rasamap.demo",     name: `${TAG} ویرایشگر`,    role: "editor" },
  { email: "admin@rasamap.demo",      name: `${TAG} ادمین`,       role: "admin" },
  { email: "superadmin@rasamap.demo", name: `${TAG} سوپرادمین`,   role: "super_admin" },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Users ────────────────────────────────────────────────────────────
  const users: Record<string, { id: number }> = {};
  for (const u of USERS) {
    const row = await prisma.user.upsert({
      where: { phone: u.phone },
      update: { name: u.name, passwordHash },
      create: { phone: u.phone, name: u.name, passwordHash },
    });
    users[u.key] = row;
  }
  console.log(`users:  ${USERS.length} upserted`);

  // ── Admins (leave any pre-existing real admin rows untouched) ─────────
  for (const a of ADMINS) {
    await prisma.admin.upsert({
      where: { email: a.email },
      update: { name: a.name, role: a.role, active: true, passwordHash },
      create: { email: a.email, name: a.name, role: a.role, active: true, passwordHash },
    });
  }
  console.log(`admins: ${ADMINS.length} upserted (roles: viewer / editor / admin / super_admin)`);

  // ── Owners ──────────────────────────────────────────────────────────
  const ownerSpecs = [
    { name: `${TAG} آژانس تبلیغاتی البرز`, phone: "02100000001", company: "Alborz Media" },
    { name: `${TAG} شرکت رسانه پارس`,      phone: "02100000002", company: "Pars Media" },
    { name: `${TAG} بابک تهرانی (شخصی)`,   phone: "09120000108", company: "" },
  ];
  const ownerRows = [];
  for (const o of ownerSpecs) {
    const existing = await prisma.owner.findFirst({ where: { name: o.name } });
    ownerRows.push(existing ?? (await prisma.owner.create({ data: o })));
  }

  // ── Listings — one per state of the submission pipeline ─────────────
  // Wipe previous demo listings, then recreate (idempotent).
  await prisma.review.deleteMany({ where: { billboard: { name: { startsWith: TAG } } } });
  await prisma.billboard.deleteMany({ where: { name: { startsWith: TAG } } });

  type L = {
    user: string; owner: number; name: string; city: string; type: string;
    price: number; status: string; plan: string; featured: boolean;
  };
  const listingSpecs: L[] = [
    { user: "publisher", owner: 0, name: `${TAG} بیلبورد بزرگراه چمران`, city: "تهران",  type: "billboard", price: 90,  status: "available",        plan: "free",     featured: false },
    { user: "publisher", owner: 0, name: `${TAG} عرشه پل پارک‌وی`,        city: "تهران",  type: "bridge",    price: 70,  status: "available",        plan: "free",     featured: false },
    { user: "waiting",   owner: 1, name: `${TAG} بیلبورد میدان نقش جهان`, city: "اصفهان", type: "billboard", price: 55,  status: "pending",          plan: "free",     featured: false },
    { user: "paying",    owner: 2, name: `${TAG} تابلوی دیجیتال ولنجک`,   city: "تهران",  type: "digital",   price: 120, status: "awaiting_payment", plan: "featured", featured: false },
    { user: "featured",  owner: 1, name: `${TAG} بیلبورد بلوار فردوسی`,   city: "مشهد",   type: "billboard", price: 65,  status: "available",        plan: "featured", featured: true  },
    { user: "rejected",  owner: 2, name: `${TAG} ایستگاه اتوبوس ونک`,     city: "تهران",  type: "station",   price: 25,  status: "rejected",         plan: "free",     featured: false },
    { user: "agency",    owner: 0, name: `${TAG} بیلبورد اتوبان کرج`,     city: "کرج",    type: "billboard", price: 45,  status: "pending",          plan: "free",     featured: false },
    { user: "agency",    owner: 0, name: `${TAG} عرشه پل شهید همت`,       city: "تهران",  type: "bridge",    price: 80,  status: "available",        plan: "free",     featured: false },
  ];

  const listingIds: Record<string, number> = {};
  for (const [i, l] of listingSpecs.entries()) {
    const row = await prisma.billboard.create({
      data: {
        name: l.name, slug: `demo-listing-${i + 1}`, location: `${TAG} موقعیت نمونه`,
        region: "منطقه نمونه", city: l.city, type: l.type,
        status: l.status, plan: l.plan, featured: l.featured,
        width: 12, height: 4, area: 48, faces: 2, age: 1,
        price: l.price, priceWeekly: Math.round(l.price / 4),
        priceQuarterly: Math.round(l.price * 3 * 0.9), priceYearly: l.price * 12,
        traffic: { daily: 40000, peakHour: "18:00", congestionLevel: 6, pedestrian: 5000, estimatedViews: 6000, viewabilityScore: 60 },
        estimatedViews: 6000,
        mapX: 50, mapY: 50, icon: "location", images: [], hasImages: false,
        agency: ownerSpecs[l.owner].company || ownerSpecs[l.owner].name,
        phone: ownerSpecs[l.owner].phone,
        description: `${TAG} رسانه ثبت‌شده توسط مالک از طریق فرم «ثبت رسانه»`,
        features: [], nearbyLandmarks: [], rating: 0, reviewCount: 0,
        source: "listing",
        ownerId: ownerRows[l.owner].id,
        submittedById: users[l.user].id,
      },
    });
    listingIds[l.name] = row.id;
  }
  console.log(`owners: ${ownerRows.length} · listings: ${listingSpecs.length} (published / pending / awaiting payment / rejected)`);

  // ── Reviews — any signed-in account may review a published media item ─
  const publishedIds = listingSpecs
    .filter(l => l.status === "available")
    .map(l => listingIds[l.name]);

  const reviews = [
    { user: "reviewer",  billboardId: publishedIds[0], rating: 5, comment: `${TAG} موقعیت عالی، بازدید بالا. راضی بودیم.` },
    { user: "publisher", billboardId: publishedIds[1], rating: 4, comment: `${TAG} خوب بود، نصب کمی طول کشید.` },
    { user: "waiting",   billboardId: publishedIds[0], rating: 3, comment: `${TAG} متوسط. قیمت نسبت به ترافیک بالاست.` },
  ];
  for (const rv of reviews) {
    await prisma.review.upsert({
      where: { billboardId_userId: { billboardId: rv.billboardId, userId: users[rv.user].id } },
      update: { rating: rv.rating, comment: rv.comment },
      create: { billboardId: rv.billboardId, userId: users[rv.user].id, rating: rv.rating, comment: rv.comment },
    });
  }
  // Keep the denormalised aggregate in step with the rows just written — the
  // same recomputation POST /api/reviews does.
  for (const billboardId of new Set(reviews.map(r => r.billboardId))) {
    const agg = await prisma.review.aggregate({
      where: { billboardId }, _avg: { rating: true }, _count: { _all: true },
    });
    await prisma.billboard.update({
      where: { id: billboardId },
      data: {
        rating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        reviewCount: agg._count._all,
      },
    });
  }
  console.log(`reviews: ${reviews.length}`);

  // ── Print the account sheet ────────────────────────────────────────
  console.log("\n──────────────────────────────────────────────────────────────");
  console.log("DEMO ACCOUNTS  (password for all: " + PASSWORD + ")");
  console.log("──────────────────────────────────────────────────────────────");
  console.log("\nUsers  — log in at /login with the phone number:");
  for (const u of USERS) console.log(`  ${u.phone}  ${u.name.padEnd(14)}  ${u.note}`);
  console.log("\nAdmins — log in at /admin/login with the email:");
  for (const a of ADMINS) console.log(`  ${a.email.padEnd(26)}  role: ${a.role}`);
  console.log("\n(The real super_admin account already in the DB is left untouched.)");
  console.log("──────────────────────────────────────────────────────────────\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
