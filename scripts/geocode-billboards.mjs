/**
 * geocode-billboards.mjs
 *
 * برای بیلبوردهایی که lat/lng ندارند،
 * از Neshan Geocoding API مختصات می‌گیرد و در DB ذخیره می‌کند.
 *
 * اجرا:
 *   node scripts/geocode-billboards.mjs --city زنجان   ← فقط یک شهر
 *   node scripts/geocode-billboards.mjs --all            ← همه شهرها
 *   node scripts/geocode-billboards.mjs --dry-run --city زنجان  ← پرینت بدون ذخیره
 */

import Database from "better-sqlite3";
import https from "https";

// ── Config ──────────────────────────────────────────────────────────
const DB_PATH   = new URL("../dev.db", import.meta.url).pathname;
const API_KEY   = "service.b0ae1188ad124aca863eeadca082c6ef";
const DELAY_MS  = 700; // کمتر از 2 درخواست در ثانیه

// ── CLI args ────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ALL     = args.includes("--all");
const cityIdx = args.indexOf("--city");
const CITY    = cityIdx !== -1 ? args[cityIdx + 1] : null;

if (!ALL && !CITY) {
  console.error("❌ باید --city <شهر> یا --all بدهید");
  process.exit(1);
}

// ── Neshan geocoding ─────────────────────────────────────────────────
function geocode(address) {
  return new Promise((resolve, reject) => {
    const url = `https://api.neshan.org/v4/geocoding?address=${encodeURIComponent(address)}`;
    const req = https.get(url, { headers: { "Api-Key": API_KEY } }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.status === "OK" && json.location) {
            resolve({ lat: json.location.y, lng: json.location.x, formatted: json.formatted_address ?? address });
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Distance check (km) between two points ──────────────────────────
function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  const db = new Database(DB_PATH);

  // مرکز هر شهر را از بیلبوردهایی که مختصات دارند حساب می‌کنیم
  const cityCenters = {};
  const centerRows = db.prepare(
    `SELECT city, AVG(lat) as lat, AVG(lng) as lng, COUNT(*) as cnt
     FROM billboards WHERE lat IS NOT NULL AND lat != 0 AND lng IS NOT NULL AND lng != 0
     GROUP BY city HAVING cnt >= 2`
  ).all();
  for (const c of centerRows) cityCenters[c.city] = { lat: c.lat, lng: c.lng };
  console.log(`📍 مرکز ${Object.keys(cityCenters).length} شهر از DB محاسبه شد`);

  const where = CITY
    ? `WHERE (lat IS NULL OR lat = 0) AND city LIKE '%${CITY}%'`
    : `WHERE (lat IS NULL OR lat = 0)`;

  const rows = db.prepare(
    `SELECT id, name, location, city FROM billboards ${where} ORDER BY city, id`
  ).all();

  console.log(`\n🔍 ${rows.length} بیلبورد پیدا شد${CITY ? ` در ${CITY}` : ""} (lat=null یا 0)`);
  if (DRY_RUN) console.log("⚠️  Dry-run — چیزی ذخیره نمی‌شود\n");

  const update = db.prepare(`UPDATE billboards SET lat = ?, lng = ? WHERE id = ?`);

  let ok = 0, fail = 0, rejected = 0;
  const MAX_DIST_KM = 60; // حداکثر فاصله قابل قبول از مرکز شهر

  for (const row of rows) {
    const locShort = (row.location || "").split("،")[0].trim();
    // چند فرمت آدرس رو امتحان می‌کنیم
    const addressCandidates = [
      [locShort, row.city].filter(Boolean).join(" "),                 // "میدان انقلاب زنجان"
      [locShort.replace(/^بیلبورد\s+/, ""), row.city].filter(Boolean).join(" "), // بدون "بیلبورد"
      row.city,                                                         // فقط شهر — fallback
    ].filter((a, i, arr) => a && arr.indexOf(a) === i);  // deduplicate

    process.stdout.write(`[${row.id}] ${row.name.slice(0, 38).padEnd(38)} → `);

    const center = cityCenters[row.city];
    let accepted = null;

    for (const addr of addressCandidates) {
      const result = await geocode(addr);
      if (!result) { await sleep(300); continue; }

      if (!center) {
        accepted = { result, addr, dist: null };
        break;
      }
      const dist = distKm(center.lat, center.lng, result.lat, result.lng);
      if (dist <= MAX_DIST_KM) {
        accepted = { result, addr, dist };
        break;
      }
      await sleep(300);
    }

    if (accepted) {
      const { result, dist } = accepted;
      const distStr = dist !== null ? `${dist.toFixed(1)}km از مرکز` : "بدون validation";
      console.log(`✓ ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)} (${distStr})`);
      if (!DRY_RUN) update.run(result.lat, result.lng, row.id);
      ok++;
    } else {
      console.log(`✗ هیچ فرمتی قابل قبول نبود`);
      fail++;
    }

    await sleep(DELAY_MS);
  }

  db.close();
  console.log(`\n✅ موفق: ${ok}  |  ⚠ رد شده: ${rejected}  |  ✗ شکست: ${fail}  |  مجموع: ${rows.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
