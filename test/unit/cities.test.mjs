// Every city the crawled dataset names must be one the catalogue knows.
//
// A city missing from lib/geo/iran-cities.ts cannot be filtered to (the
// explore filter checks the list) and its rows fall off the province map —
// 61 cities and about 380 rows were in that state before this test existed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { provinces, canonicalCity } from "../../lib/geo/iran-cities.ts";

test("every city in the crawled dataset is in the province list", () => {
  const known = new Set(provinces.flatMap(p => p.cities.map(c => c.name)));
  const rows = JSON.parse(readFileSync(new URL("../../scraper/data/billboards.json", import.meta.url), "utf8"));
  const missing = [...new Set(rows.map(r => canonicalCity(r.city)).filter(c => !known.has(c)))];
  assert.deepEqual(missing, [], `cities the catalogue cannot filter to: ${missing.join("، ")}`);
});

test("a city appears under one province only", () => {
  const seen = new Map();
  for (const p of provinces) for (const c of p.cities) {
    assert.ok(!seen.has(c.name), `${c.name} is listed under ${seen.get(c.name)} and ${p.name}`);
    seen.set(c.name, p.name);
  }
});

test("a location is read out of the links people paste", async () => {
  const { parseMapLocation } = await import("../../lib/domain/location.ts");
  const at = { lat: 35.7, lng: 51.4 };
  for (const input of [
    "35.7, 51.4",
    "۳۵٫۷، ۵۱٫۴",
    "51.4, 35.7",
    "https://www.google.com/maps/@35.7,51.4,15z",
    "https://www.google.com/maps/place/X/@35.6,51.3,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d35.7!4d51.4",
    "https://maps.google.com/?q=35.7,51.4",
    "https://neshan.org/maps/@35.7,51.4,16z,0p",
    "https://balad.ir/location?latitude=35.7&longitude=51.4&zoom=16",
    "https://www.openstreetmap.org/?mlat=35.7&mlon=51.4#map=16/35.7/51.4",
    "https://www.openstreetmap.org/#map=16/35.7/51.4",
  ]) {
    assert.deepEqual(parseMapLocation(input), at, input);
  }
  assert.equal(parseMapLocation("48.85, 2.35"), null, "Paris is not in the catalogue");
  assert.equal(parseMapLocation("خیابان ولیعصر"), null);
  assert.equal(parseMapLocation(""), null);
});
