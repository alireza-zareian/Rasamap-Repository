// ============================================================
// RASAMAP — Coordinate backfill script (Phase 5, DB cleanup)
//
// Why this exists: rows with lat/lng = null get placed on the map via
// a "city center + jitter" fallback at render time (see architecture
// doc). That's why some billboards look like they're floating in the
// wrong spot even though every other field about them is correct —
// they were never actually geocoded, or were geocoded before Neshan
// was set up / before an address correction.
//
// This script re-uses the exact same geocoding path scraper.py already
// has (Neshan v6, v5 emergency fallback, per-city bias, geocode_cache
// shared with the scraper so addresses already resolved cost nothing)
// but points it at rows already sitting in the DB instead of freshly
// scraped items.
//
// Two modes:
//   npm run db:backfill-coords
//     -> only fills rows where lat or lng is NULL. Non-destructive.
//   npm run db:backfill-coords -- --recheck-implausible
//     -> ALSO re-geocodes rows that already have lat/lng but land more
//        than ~150km from their city's center (the same plausibility
//        check scraper.py uses) — the likely case of "everything about
//        this billboard is right except the pin on the map".
//
// Requires NESHAN_API_KEY in .env.local (same variable the scraper
// uses — get a free key at https://platform.neshan.org).
// ============================================================

import "dotenv/config";
import path from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// ── Load .env.local the same way scraper.py does (project root) ──
const envFile = path.join(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const k = trimmed.slice(0, idx).trim();
    let v = trimmed.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

const NESHAN_API_KEY = process.env.NESHAN_API_KEY ?? "";
const NESHAN_V6 = "https://api.neshan.org/v6/geocoding";
const NESHAN_V5 = "https://api.neshan.org/v5/geocoding";
const GEOCODE_TIMEOUT_MS = 5000;
const GEOCODE_SLEEP_MS = 200;

const CACHE_FILE = path.join(process.cwd(), "scraper", "data", "geocode_cache.json");

const RECHECK_IMPLAUSIBLE = process.argv.includes("--recheck-implausible");

// Same table scraper.py uses for search bias + plausibility checks.
const CITY_CENTERS: Record<string, [number, number]> = {
  "تهران": [35.6892, 51.3890], "کرج": [35.8400, 50.9391], "اصفهان": [32.6539, 51.6660],
  "مشهد": [36.2972, 59.6067], "شیراز": [29.5917, 52.5836], "تبریز": [38.0800, 46.2919],
  "اهواز": [31.3183, 48.6706], "قم": [34.6416, 50.8746], "کرمانشاه": [34.3142, 47.0650],
  "رشت": [37.2809, 49.5832], "زنجان": [36.6736, 48.4787], "یزد": [31.8974, 54.3569],
  "ارومیه": [37.5527, 45.0761], "کرمان": [30.2839, 57.0834], "همدان": [34.7990, 48.5147],
  "اراک": [34.0954, 49.7092], "بندرعباس": [27.1832, 56.2666], "ساری": [36.5633, 53.0601],
  "قزوین": [36.2688, 50.0041], "سنندج": [35.3219, 46.9861], "اردبیل": [38.2498, 48.2933],
  "گرگان": [36.8428, 54.4439], "خرم‌آباد": [33.4878, 48.3558], "زاهدان": [29.4963, 60.8629],
  "بوشهر": [28.9684, 50.8385], "سمنان": [35.5729, 53.3970], "یاسوج": [30.6682, 51.5879],
  "ایلام": [33.6374, 46.4227], "بیرجند": [32.8663, 59.2211], "شهرکرد": [32.3256, 50.8644],
  "بجنورد": [37.4747, 57.3290],
};

type CacheEntry = { lat: number; lng: number } | null;
function loadCache(): Record<string, CacheEntry> {
  if (!existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}
function saveCache(cache: Record<string, CacheEntry>) {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}
// Only successful (non-null) geocodes are worth persisting across runs —
// a null just means "failed this time" (often a transient quota/rate-limit
// hit), and caching it forever would silently prevent ever retrying it.
function filterResolved(cache: Record<string, CacheEntry>): Record<string, CacheEntry> {
  const out: Record<string, CacheEntry> = {};
  for (const [k, v] of Object.entries(cache)) if (v) out[k] = v;
  return out;
}

function coordsPlausible(lat: number, lng: number, city: string): boolean {
  const center = CITY_CENTERS[city];
  if (!center) return true; // unknown city — accept anything
  const [clat, clng] = center;
  const dlat = (lat - clat) * 111.0;
  const dlng = (lng - clng) * 111.0 * Math.cos((clat * Math.PI) / 180);
  const distKm = Math.sqrt(dlat * dlat + dlng * dlng);
  return distKm < 150;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { headers: { "Api-Key": NESHAN_API_KEY }, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function geocodeAddress(address: string, city: string): Promise<{ lat: number; lng: number } | null> {
  const fullAddress = city ? `${address}، ${city}` : address;
  const [clat, clng] = CITY_CENTERS[city] ?? [35.6892, 51.389];
  const qs = new URLSearchParams({ address: fullAddress, lat: String(clat), lng: String(clng) });
  let lastStatus: number | string | undefined;

  for (const base of [NESHAN_V6, NESHAN_V5]) {
    try {
      const resp = await fetchWithTimeout(`${base}?${qs.toString()}`, GEOCODE_TIMEOUT_MS);
      if (!resp.ok) {
        lastStatus = resp.status;
        continue;
      }
      const data = (await resp.json()) as { location?: { x?: number; y?: number; lat?: number; lng?: number } };
      const loc = data.location ?? {};
      const lat = loc.y ?? loc.lat;
      const lng = loc.x ?? loc.lng;
      if (lat && lng) return { lat: Number(lat), lng: Number(lng) };
      lastStatus = "empty-location";
    } catch (e) {
      lastStatus = e instanceof Error ? e.name : "unknown-error";
    }
  }
  if (lastStatus === 401 || lastStatus === 402 || lastStatus === 429) {
    console.log(
      `    ⚠ Neshan returned HTTP ${lastStatus} (likely quota/rate-limit or invalid key) — check https://platform.neshan.org dashboard`
    );
  } else if (lastStatus !== undefined) {
    console.log(`    ⚠ geocode failed, last status: ${lastStatus}`);
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!NESHAN_API_KEY) {
    console.log("⚠ NESHAN_API_KEY is not set in .env.local — nothing to do.");
    console.log("  Get a free key at https://platform.neshan.org");
    return;
  }

  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const rows = await prisma.billboard.findMany({
    where: { location: { not: "" } },
  });

  const targets = rows.filter((r) => {
    if (r.lat == null || r.lng == null) return true;
    if (RECHECK_IMPLAUSIBLE && !coordsPlausible(r.lat, r.lng, r.city)) return true;
    return false;
  });

  if (targets.length === 0) {
    console.log("Nothing to backfill — every row already has plausible coordinates.");
    await prisma.$disconnect();
    return;
  }

  console.log(
    `Found ${targets.length} row(s) needing coordinates` +
      (RECHECK_IMPLAUSIBLE ? " (including implausible existing ones)." : ".")
  );

  const cache = loadCache();
  let resolved = 0, fromCache = 0, notFound = 0;

  for (const [i, row] of targets.entries()) {
    const key = row.location.trim();
    let coords: CacheEntry | undefined = cache[key];

    if (coords === undefined) {
      coords = await geocodeAddress(row.location, row.city);
      cache[key] = coords; // kept in-memory for this run so duplicate addresses this run don't re-query
      if ((i + 1) % 20 === 0) saveCache(filterResolved(cache));
      await sleep(GEOCODE_SLEEP_MS);
    } else if (coords) {
      fromCache++;
    }

    if (coords && coordsPlausible(coords.lat, coords.lng, row.city)) {
      await prisma.billboard.update({
        where: { id: row.id },
        data: { lat: coords.lat, lng: coords.lng },
      });
      resolved++;
      console.log(`  [${i + 1}/${targets.length}] ✓ id=${row.id} "${row.name}" -> ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    } else {
      notFound++;
      console.log(`  [${i + 1}/${targets.length}] ✗ id=${row.id} "${row.name}" -> not found / implausible, left as-is`);
    }
  }

  saveCache(filterResolved(cache));

  console.log(`\nDone. ${resolved} row(s) updated (${fromCache} from cache), ${notFound} unresolved.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
