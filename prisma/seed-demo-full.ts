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
 * The account list it prints is also kept in RUNBOOK.md.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import type { BillboardType, ListingPlan, Moderation } from "@prisma/client";

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

  // ── Who owns the media ──────────────────────────────────────────────
  // Written onto each listing as its agency and phone, which is what every
  // page reads — there is no separate owners table.
  const ownerSpecs = [
    { name: `${TAG} آژانس تبلیغاتی البرز`, phone: "02100000001", company: "Alborz Media" },
    { name: `${TAG} شرکت رسانه پارس`,      phone: "02100000002", company: "Pars Media" },
    { name: `${TAG} بابک تهرانی (شخصی)`,   phone: "09120000108", company: "" },
  ];

  // ── Listings — one per state of the submission pipeline ─────────────
  // Wipe previous demo listings, then recreate (idempotent).
  //
  // Reviews are matched by their own tag rather than by the billboard they hang
  // on. Matching by billboard looks equivalent and is not: an earlier run wrote
  // its reviews before these demo listings existed, so three of them landed on
  // two *crawled* catalogue rows, where a cleanup keyed on the listing name can
  // never reach them — and "[DEMO] موقعیت عالی" sat on a live billboard page for
  // anyone who opened it. The tag marks what this script owns, wherever it ended
  // up, so that is what the tag is matched on.
  //
  // Nothing is recomputed for those crawled rows on purpose: their `rating` and
  // `reviewCount` come from the crawler and were never derived from these rows
  // (they read 4.1/11 next to two actual review rows). Recomputing would zero a
  // number the crawler owns; the stray comments are what has to go.
  await prisma.review.deleteMany({ where: { comment: { startsWith: TAG } } });
  await prisma.billboard.deleteMany({ where: { name: { startsWith: TAG } } });

  /**
   * Traffic per listing, not one number copied eight times.
   *
   * These used to share a single hardcoded block (40 000 daily / 6 000 views /
   * score 60 for every row), which made the demo listings the only media on the
   * site whose audience did not depend on where they stand — and put a visibly
   * flat set of figures next to 3 500 rows that all differ. Each row below is
   * the output of `scraper/traffic_formula.py::estimate_traffic(city, name,
   * type, 12, 4)` — the same function that produced the numbers for the crawled
   * catalogue — so a bridge over Hemmat outranks a bus shelter in Vanak for the
   * same reason it does in the real data, and nothing here is invented
   * separately from the model the thesis documents.
   */
  type L = {
    user: string; owner: number; name: string; city: string; type: BillboardType;
    price: number; moderation: Moderation; plan: ListingPlan; featured: boolean;
    daily: number; pedestrian: number; views: number; score: number;
    peak: string; congestion: number;
  };
  const listingSpecs: L[] = [
    { user: "publisher", owner: 0, name: `${TAG} بیلبورد بزرگراه چمران`, city: "تهران",  type: "billboard", price: 90,  moderation: "approved",         plan: "free",     featured: false, daily: 233150, pedestrian:  2331, views: 123662, score: 34, peak: "17:00-19:00", congestion: 8 },
    { user: "publisher", owner: 0, name: `${TAG} عرشه پل پارک‌وی`,        city: "تهران",  type: "bridge",    price: 70,  moderation: "approved",         plan: "free",     featured: false, daily:  14573, pedestrian:  2040, views:  11328, score: 46, peak: "18:00-20:00", congestion: 3 },
    { user: "waiting",   owner: 1, name: `${TAG} بیلبورد میدان نقش جهان`, city: "اصفهان", type: "billboard", price: 55,  moderation: "pending",          plan: "free",     featured: false, daily:  45745, pedestrian: 10063, views:  44531, score: 55, peak: "17:30-19:30", congestion: 9 },
    { user: "paying",    owner: 2, name: `${TAG} تابلوی دیجیتال ولنجک`,   city: "تهران",  type: "digital",   price: 120, moderation: "awaiting_payment", plan: "featured", featured: false, daily:  40239, pedestrian:  7243, views:  41628, score: 60, peak: "18:00-20:00", congestion: 5 },
    { user: "featured",  owner: 1, name: `${TAG} بیلبورد بلوار فردوسی`,   city: "مشهد",   type: "billboard", price: 65,  moderation: "approved",         plan: "featured", featured: true,  daily:  82803, pedestrian:  7452, views:  57034, score: 42, peak: "07:30-09:00", congestion: 7 },
    { user: "rejected",  owner: 2, name: `${TAG} ایستگاه اتوبوس ونک`,     city: "تهران",  type: "station",   price: 25,  moderation: "rejected",         plan: "free",     featured: false, daily:  13022, pedestrian: 31252, views:  26669, score: 52, peak: "07:00-08:30", congestion: 4 },
    { user: "agency",    owner: 0, name: `${TAG} بیلبورد اتوبان کرج`,     city: "کرج",    type: "billboard", price: 45,  moderation: "pending",          plan: "free",     featured: false, daily: 137889, pedestrian:  1378, views:  73135, score: 34, peak: "17:00-19:00", congestion: 8 },
    { user: "agency",    owner: 0, name: `${TAG} عرشه پل شهید همت`,       city: "تهران",  type: "bridge",    price: 80,  moderation: "approved",         plan: "free",     featured: false, daily: 272318, pedestrian:  2723, views: 166102, score: 39, peak: "17:00-19:00", congestion: 8 },
  ];

  const listingIds: Record<string, number> = {};
  for (const [i, l] of listingSpecs.entries()) {
    const row = await prisma.billboard.create({
      data: {
        name: l.name, slug: `demo-listing-${i + 1}`, location: `${TAG} موقعیت نمونه`,
        region: "منطقه نمونه", city: l.city, type: l.type,
        moderation: l.moderation, plan: l.plan, featured: l.featured,
        width: 12, height: 4, area: 48, faces: 2, age: 1,
        price: l.price, priceWeekly: Math.round(l.price / 4),
        priceQuarterly: Math.round(l.price * 3 * 0.9), priceYearly: l.price * 12,
        traffic: { daily: l.daily, peakHour: l.peak, congestionLevel: l.congestion, pedestrian: l.pedestrian, estimatedViews: l.views, viewabilityScore: l.score },
        estimatedViews: l.views,
        images: [], hasImages: false,
        agency: ownerSpecs[l.owner].company || ownerSpecs[l.owner].name,
        phone: ownerSpecs[l.owner].phone,
        description: `${TAG} رسانه ثبت‌شده توسط مالک از طریق فرم «ثبت رسانه»`,
        features: [], nearbyLandmarks: [], rating: 0, reviewCount: 0,
        source: "listing",
        submittedById: users[l.user].id,
      },
    });
    listingIds[l.name] = row.id;
  }
  console.log(`listings: ${listingSpecs.length} (published / pending / awaiting payment / rejected)`);

  // ── Reviews — any signed-in account may review a published media item ─
  const publishedIds = listingSpecs
    .filter(l => l.moderation === "approved")
    .map(l => listingIds[l.name]);

  // publishedIds[2] is the one listing with `featured: true`, which the
  // catalogue sort puts above every other row (§18 — it is how the paid plan
  // is demonstrated). It had no reviews, so the first card a visitor ever sees
  // was the only one on the page with an empty rating slot. It is reviewed here
  // for the same reason it is featured: it is the row everyone looks at.
  const reviews = [
    { user: "reviewer",  billboardId: publishedIds[0], rating: 5, comment: `${TAG} موقعیت عالی، بازدید بالا. راضی بودیم.` },
    { user: "publisher", billboardId: publishedIds[1], rating: 4, comment: `${TAG} خوب بود، نصب کمی طول کشید.` },
    { user: "waiting",   billboardId: publishedIds[0], rating: 3, comment: `${TAG} متوسط. قیمت نسبت به ترافیک بالاست.` },
    { user: "reviewer",  billboardId: publishedIds[2], rating: 5, comment: `${TAG} روی مسیر صبحگاهی مشهد، دیده‌شدنش واقعاً بالاست.` },
    { user: "publisher", billboardId: publishedIds[2], rating: 4, comment: `${TAG} گزارش بازدید با چیزی که دیدیم خواند. تمدید کردیم.` },
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
