// Remove cross-source duplicates already in the database, with the matching
// scraper.py's cross_source_dedup() applies to new crawls: same city, plus an
// identical photo, a near-identical address or a near-identical name. Only
// crawled rows (non-null `source`) are considered.
//
//   npm run db:dedupe             dry run — prints the groups, changes nothing
//   npm run db:dedupe -- --apply  deletes the losers

import "./load-env";
import path from "path";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { PrismaClient, type Billboard as Row } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

// ── Same normalization/thresholds as scraper.py's cross_source_dedup ──
const ADDRESS_NOISE_WORDS = [
  "خیابان", "بلوار", "میدان", "کوچه", "پلاک", "طبقه",
  "نبش", "جنب", "روبروی", "نرسیده به", "کوی",
];
const ADDRESS_SIMILARITY_THRESHOLD = 0.82;
const NAME_SIMILARITY_THRESHOLD = 0.88;

function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  let t = text.trim();
  const faDigits = "۰۱۲۳۴۵۶۷۸۹";
  for (let i = 0; i < faDigits.length; i++) {
    t = t.split(faDigits[i]).join(String(i));
  }
  t = t.replace(/[،,.\-–—()]/g, " ");
  for (const w of ADDRESS_NOISE_WORDS) t = t.split(w).join(" ");
  t = t.replace(/\s+/g, " ").trim().toLowerCase();
  return t;
}

// Dice coefficient (bigram overlap) — a JS-side stand-in for Python's
// difflib.SequenceMatcher.ratio(), no extra dependency required.
function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.substring(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };
  const bgA = bigrams(a);
  const bgB = bigrams(b);
  let intersection = 0;
  for (const [bg, count] of bgA) {
    const other = bgB.get(bg);
    if (other) intersection += Math.min(count, other);
  }
  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

const imageHashCache = new Map<string, string | null>();

function imageFileHash(webPath: string): string | null {
  const fname = path.basename(webPath);
  if (!imageHashCache.has(fname)) {
    try {
      const fpath = path.join(process.cwd(), "public", "images", "scraped", fname);
      const bytes = readFileSync(fpath);
      imageHashCache.set(fname, createHash("md5").update(bytes).digest("hex"));
    } catch {
      imageHashCache.set(fname, null);
    }
  }
  return imageHashCache.get(fname) ?? null;
}

function imageHashes(row: Row): Set<string> {
  const images = (row.images as unknown as string[]) ?? [];
  const hashes = new Set<string>();
  for (const p of images) {
    const h = imageFileHash(p);
    if (h) hashes.add(h);
  }
  return hashes;
}

function isDuplicate(a: Row, b: Row): { dup: boolean; reason?: string } {
  if (a.source === b.source) return { dup: false }; // same-source dupes shouldn't exist (unique slug) — not this script's job
  if (a.city !== b.city) return { dup: false };

  const aImgs = imageHashes(a);
  if (aImgs.size) {
    const bImgs = imageHashes(b);
    for (const h of aImgs) {
      if (bImgs.has(h)) return { dup: true, reason: "identical photo" };
    }
  }

  const addrA = normalizeText(a.location);
  const addrB = normalizeText(b.location);
  const addrSim = textSimilarity(addrA, addrB);
  if (addrSim >= ADDRESS_SIMILARITY_THRESHOLD) {
    return { dup: true, reason: `address similarity ${addrSim.toFixed(2)}` };
  }

  const nameA = normalizeText(a.name);
  const nameB = normalizeText(b.name);
  const nameSim = textSimilarity(nameA, nameB);
  if (nameSim >= NAME_SIMILARITY_THRESHOLD && addrSim >= 0.6) {
    return { dup: true, reason: `name similarity ${nameSim.toFixed(2)} + related address` };
  }

  return { dup: false };
}

async function main() {
  const rows = await prisma.billboard.findMany({
    where: { source: { not: null } },
    orderBy: { id: "asc" }, // lower id (seeded earlier) is kept as the "winner"
  });

  console.log(`Scanning ${rows.length} scraped billboard row(s) for cross-source duplicates...`);

  const kept: Row[] = [];
  const toDelete: { row: Row; keptAs: Row; reason: string }[] = [];

  for (const row of rows) {
    let dupOf: { row: Row; reason: string } | null = null;
    for (const existing of kept) {
      const { dup, reason } = isDuplicate(row, existing);
      if (dup) {
        dupOf = { row: existing, reason: reason! };
        break;
      }
    }
    if (dupOf) {
      toDelete.push({ row, keptAs: dupOf.row, reason: dupOf.reason });
    } else {
      kept.push(row);
    }
  }

  if (toDelete.length === 0) {
    console.log("No cross-source duplicates found. Nothing to do.");
    return;
  }

  console.log(`\nFound ${toDelete.length} duplicate row(s):\n`);
  for (const { row, keptAs, reason } of toDelete) {
    console.log(
      `  id=${row.id} (${row.source}) "${row.name}" @ ${row.city}\n` +
      `    -> duplicate of id=${keptAs.id} (${keptAs.source}) "${keptAs.name}"\n` +
      `    -> reason: ${reason}`
    );
  }

  if (!APPLY) {
    console.log(`\nDry run only — no rows deleted. Re-run with --apply to delete the ${toDelete.length} row(s) above.`);
    return;
  }

  console.log(`\n--apply passed — deleting ${toDelete.length} row(s)...`);
  const ids = toDelete.map((d) => d.row.id);

  // The loser is still in the feed; the tombstone keeps prisma/sync-scraped.ts
  // from recreating it, and names the row it merged into.
  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.billboard.deleteMany({ where: { id: { in: ids } } });
    for (const d of toDelete) {
      await tx.sourceTombstone.upsert({
        where:  { slug: d.row.slug },
        update: { reason: "dedupe", note: `merged into ${d.keptAs.slug}` },
        create: { slug: d.row.slug, reason: "dedupe", note: `merged into ${d.keptAs.slug}` },
      });
    }
    return deleted;
  });
  console.log(`Deleted ${result.count} row(s), each recorded in source_tombstones.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
