// The product's rules, tested without a build, a server or a database.
//
// lib/domain has no I/O by construction (eslint.config.mjs forbids it), so its
// files can be imported straight into Node — which strips the TypeScript types
// on load — and this whole file runs in well under a second:
//
//   npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { derivedPrices } from "../../lib/domain/pricing.ts";
import { averageRating } from "../../lib/domain/rating.ts";
import { hasRole, isStaffRole } from "../../lib/domain/roles.ts";
import { DomainError, isUniqueViolation, notFound } from "../../lib/domain/errors.ts";
import { NO_TRAFFIC, StringListSchema, TrafficSchema } from "../../lib/domain/billboard.ts";
import {
  ListingFieldsSchema, decisionOutcome, initialModeration,
} from "../../lib/domain/listing.ts";
import { latinDigits } from "../../lib/domain/digits.ts";
import { MobileNumber } from "../../lib/domain/phone.ts";
import { NewPassword, GivenPassword } from "../../lib/domain/password.ts";

test("the three longer prices follow from the monthly one", () => {
  assert.deepEqual(derivedPrices(100), { price: 100, priceWeekly: 25, priceQuarterly: 270, priceYearly: 960 });
});

test("a rating shows one decimal, and an unrated item shows 0", () => {
  assert.equal(averageRating(4.25), 4.3);
  assert.equal(averageRating(null), 0);
});

test("roles form a ladder, and a customer is not on it", () => {
  assert.ok(hasRole("admin", "editor"));
  assert.ok(!hasRole("editor", "admin"));
  assert.ok(hasRole("viewer", "viewer"));
  assert.ok(!isStaffRole("user"));
});

test("a paid plan waits for payment; a free one only for review", () => {
  assert.equal(initialModeration("free"), "pending");
  assert.equal(initialModeration("featured"), "awaiting_payment");
});

test("only approving a listing that asked for promotion grants it", () => {
  assert.deepEqual(decisionOutcome("approve", "featured"), { moderation: "approved", featured: true });
  assert.deepEqual(decisionOutcome("approve", "free"), { moderation: "approved", featured: false });
  assert.deepEqual(decisionOutcome("reject", "featured"), { moderation: "rejected", featured: false });
  assert.deepEqual(decisionOutcome("revision", "featured"), { moderation: "needs_revision", featured: false });
});

test("a listing's name and city are trimmed, so the duplicate index sees one listing", () => {
  const base = { phone: "09123456789", type: "billboard", location: "میدان آزادی", width: 10, height: 4, faces: 1, price: 50 };
  const a = ListingFieldsSchema.parse({ ...base, name: "بیلبورد آزادی ", city: " تهران" });
  const b = ListingFieldsSchema.parse({ ...base, name: "بیلبورد آزادی", city: "تهران" });
  assert.equal(a.name, b.name);
  assert.equal(a.city, b.city);
});

test("a listing refuses a phone that is not an Iranian mobile", () => {
  const r = ListingFieldsSchema.safeParse({ name: "بیلبورد", city: "تهران", phone: "123", type: "billboard", width: 1, height: 1, faces: 1, price: 1 });
  assert.equal(r.success, false);
});

test("a domain error carries its kind and a message for the user", () => {
  const err = notFound("رسانه یافت نشد");
  assert.ok(err instanceof DomainError);
  assert.equal(err.kind, "not_found");
  assert.ok(isUniqueViolation({ code: "P2002" }));
  assert.ok(!isUniqueViolation(new Error("P2002")));
});

test("a traffic block and a list of strings are checked, not assumed", () => {
  assert.ok(TrafficSchema.safeParse(NO_TRAFFIC).success);
  assert.ok(!TrafficSchema.safeParse({ daily: "many" }).success);
  assert.ok(StringListSchema.safeParse(["/a.jpg"]).success);
  assert.ok(!StringListSchema.safeParse("/a.jpg").success);
});

test("Persian and Arabic digits read as Latin ones in numbers and passwords", () => {
  assert.equal(latinDigits("۰۹۱۲۳۴۵۶۷۸۹"), "09123456789");
  assert.equal(latinDigits("٠٩١٢"), "0912");
  assert.equal(latinDigits("abc"), "abc");

  const phone = MobileNumber().safeParse(" ۰۹۱۲۳۴۵۶۷۸۹ ");
  assert.equal(phone.success && phone.data, "09123456789");
  assert.equal(MobileNumber().safeParse("۰۸۱۲۳۴۵۶۷۸۹").success, false);

  const set = NewPassword.safeParse("رمز۱۲۳۴۵");
  const given = GivenPassword.safeParse("رمز12345");
  assert.ok(set.success && given.success);
  assert.equal(set.data, given.data, "the password stored and the password typed must compare equal");
  assert.equal(NewPassword.safeParse("۱۲۳۴۵۶۷").success, false, "still too short after conversion");
});

test("a campaign prices every board for the same period and counts its reach", async () => {
  const { campaignTotals, parsePickedSlugs, MAX_PICKED } = await import("../../lib/domain/campaign.ts");
  const board = (city, price, views) => ({
    city, type: "billboard", price, priceWeekly: price / 4, priceQuarterly: price * 2.7, priceYearly: price * 9.6,
    traffic: { daily: views * 2, estimatedViews: views },
  });
  const plan = [board("تهران", 100, 10_000), board("مشهد", 300, 30_000)];

  const month = campaignTotals(plan, "month");
  assert.equal(month.cost, 400);
  assert.equal(month.impressions, 40_000 * 30);
  // 400 million toman over 1.2 million impressions: 333,333 toman per thousand.
  assert.equal(month.cpm, 333_333);
  assert.deepEqual(month.shares, [0.25, 0.75]);
  assert.deepEqual(month.cities, ["تهران", "مشهد"]);

  assert.equal(campaignTotals(plan, "week").cost, 100);
  assert.equal(campaignTotals([], "month").cpm, null, "no views: no cost per thousand, not a division by zero");

  assert.deepEqual(parsePickedSlugs("a-1, b-2,a-1,,Bad Slug,../x"), ["a-1", "b-2"], "duplicates and non-slugs are dropped");
  const many = Array.from({ length: 20 }, (_, i) => `m-${i}`).join(",");
  assert.equal(parsePickedSlugs(many).length, MAX_PICKED);
});
