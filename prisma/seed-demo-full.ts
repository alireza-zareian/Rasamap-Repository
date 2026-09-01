/**
 * Full demo dataset — a broad, realistic set of accounts and records for a
 * live presentation and for manual API testing.
 *
 *   npm run db:seed:demo:full
 *
 * Idempotent: every record is upserted on a natural key (phone / email / a
 * scoped delete-then-recreate for reservations), so re-running it does not
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

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Users: one per meaningful state a reviewer might click into ─────────
const USERS = [
  { key: "active",    phone: "09120000101", name: "سارا محمدی",     note: "confirmed + pending + past reservations, one review" },
  { key: "pending",   phone: "09120000102", name: "رضا کریمی",      note: "only pending reservations" },
  { key: "new",       phone: "09120000103", name: "نگار احمدی",     note: "just signed up — no reservations" },
  { key: "cancelled", phone: "09120000104", name: "امیر حسینی",     note: "one cancelled reservation" },
  { key: "reviewer",  phone: "09120000105", name: "مریم رستمی",     note: "confirmed past reservation + review" },
  { key: "heavy",     phone: "09120000106", name: "کاوه نادری",     note: "reservations across several cities" },
  { key: "history",   phone: "09120000107", name: "لیلا صادقی",     note: "only past (finished) reservations" },
  { key: "owner",     phone: "09120000108", name: "بابک تهرانی",    note: "also an owner with pending listings" },
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

  // ── Owners + pending listings ───────────────────────────────────────
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

  // Wipe previous demo listings, then recreate (idempotent).
  await prisma.billboard.deleteMany({ where: { name: { startsWith: TAG }, status: "pending" } });
  const listingSpecs = [
    { owner: 0, name: `${TAG} بیلبورد بزرگراه چمران`, city: "تهران",  type: "billboard", price: 90 },
    { owner: 0, name: `${TAG} عرشه پل پارک‌وی`,        city: "تهران",  type: "bridge",    price: 70 },
    { owner: 1, name: `${TAG} بیلبورد میدان نقش جهان`, city: "اصفهان", type: "billboard", price: 55 },
    { owner: 2, name: `${TAG} تابلوی دیجیتال ولنجک`,   city: "تهران",  type: "digital",   price: 120 },
  ];
  let listingCount = 0;
  for (const [i, l] of listingSpecs.entries()) {
    await prisma.billboard.create({
      data: {
        name: l.name, slug: `demo-listing-${i + 1}`, location: `${TAG} موقعیت نمونه`,
        region: "منطقه نمونه", city: l.city, type: l.type, status: "pending",
        width: 12, height: 4, faces: 2, age: 1,
        price: l.price, priceWeekly: Math.round(l.price / 4),
        priceQuarterly: Math.round(l.price * 3 * 0.9), priceYearly: l.price * 12,
        traffic: { daily: 40000, peakHour: "18:00", congestionLevel: 6, pedestrian: 5000, estimatedViews: 6000, viewabilityScore: 60 },
        mapX: 50, mapY: 50, icon: "location", images: [], agency: ownerSpecs[l.owner].company || ownerSpecs[l.owner].name,
        phone: ownerSpecs[l.owner].phone, description: `${TAG} رسانه ثبت‌شده توسط مالک — در انتظار تأیید ادمین`,
        features: [], nearbyLandmarks: [], rating: 0, reviewCount: 0,
        ownerId: ownerRows[l.owner].id,
      },
    });
    listingCount++;
  }
  console.log(`owners: ${ownerRows.length} · pending listings: ${listingCount}`);

  // ── Reservations — scoped reset then recreate ───────────────────────
  const demoUserIds = Object.values(users).map((u) => u.id);
  await prisma.reservation.deleteMany({ where: { userId: { in: demoUserIds } } });

  type R = { user: string; billboardId: number; from: number; to: number; status: string };
  const reservations: R[] = [
    { user: "active",    billboardId: 1,  from: 3,   to: 17,  status: "confirmed" },
    { user: "active",    billboardId: 4,  from: 20,  to: 50,  status: "pending" },
    { user: "active",    billboardId: 8,  from: -40, to: -10, status: "confirmed" },
    { user: "pending",   billboardId: 2,  from: 10,  to: 25,  status: "pending" },
    { user: "pending",   billboardId: 11, from: 30,  to: 60,  status: "pending" },
    { user: "cancelled", billboardId: 5,  from: 15,  to: 30,  status: "cancelled" },
    { user: "reviewer",  billboardId: 6,  from: -60, to: -30, status: "confirmed" },
    { user: "heavy",     billboardId: 1,  from: 60,  to: 75,  status: "pending" },
    { user: "heavy",     billboardId: 10, from: -20, to: 5,   status: "confirmed" },
    { user: "heavy",     billboardId: 11, from: 80,  to: 110, status: "pending" },
    { user: "history",   billboardId: 8,  from: -90, to: -60, status: "confirmed" },
    { user: "history",   billboardId: 4,  from: -30, to: -5,  status: "confirmed" },
    { user: "owner",     billboardId: 2,  from: 40,  to: 55,  status: "pending" },
  ];
  for (const r of reservations) {
    await prisma.reservation.create({
      data: {
        userId: users[r.user].id, billboardId: r.billboardId,
        startDate: addDays(today, r.from), endDate: addDays(today, r.to), status: r.status,
      },
    });
  }
  console.log(`reservations: ${reservations.length} across all statuses`);

  // ── Reviews (only where a confirmed reservation exists) ─────────────
  const reviews = [
    { user: "reviewer", billboardId: 6, rating: 5, comment: `${TAG} موقعیت عالی، بازدید بالا. راضی بودیم.` },
    { user: "active",   billboardId: 8, rating: 4, comment: `${TAG} خوب بود، نصب کمی طول کشید.` },
    { user: "history",  billboardId: 8, rating: 3, comment: `${TAG} متوسط. قیمت نسبت به ترافیک بالاست.` },
  ];
  for (const rv of reviews) {
    await prisma.review.upsert({
      where: { billboardId_userId: { billboardId: rv.billboardId, userId: users[rv.user].id } },
      update: { rating: rv.rating, comment: rv.comment },
      create: { billboardId: rv.billboardId, userId: users[rv.user].id, rating: rv.rating, comment: rv.comment },
    });
  }
  console.log(`reviews: ${reviews.length}`);

  // Reflect the confirmed future booking on the billboard status.
  await prisma.billboard.update({ where: { id: 1 }, data: { status: "reserved" } });

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
