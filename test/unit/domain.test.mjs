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
  ListingInputSchema, decisionOutcome, initialModeration,
} from "../../lib/domain/listing.ts";

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
  const base = { phone: "09123456789", type: "billboard", width: 10, height: 4, faces: 1, price: 50 };
  const a = ListingInputSchema.parse({ ...base, name: "بیلبورد آزادی ", city: " تهران" });
  const b = ListingInputSchema.parse({ ...base, name: "بیلبورد آزادی", city: "تهران" });
  assert.equal(a.name, b.name);
  assert.equal(a.city, b.city);
});

test("a listing refuses a phone that is not an Iranian mobile", () => {
  const r = ListingInputSchema.safeParse({ name: "بیلبورد", city: "تهران", phone: "123", type: "billboard", width: 1, height: 1, faces: 1, price: 1 });
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
