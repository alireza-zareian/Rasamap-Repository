// The JavaScript each route downloads, gzipped, read from the build manifest
// (Next 16's build output no longer prints sizes). Run `npm run build` first.
//
//   npm run bundle

import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const DIST = process.env.NEXT_DIST_DIR || ".next";
const MANIFEST = join(DIST, "build-manifest.json");

if (!existsSync(MANIFEST)) {
  console.error(`\n✗ no build at ${DIST}/ — run \`npm run build\` first\n`);
  process.exit(1);
}

const gz = (rel) => {
  const f = join(DIST, rel);
  try { return gzipSync(readFileSync(f)).length; } catch { return 0; }
};
const kb = (n) => (n / 1024).toFixed(1).padStart(7) + " KB";

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const shared = manifest.rootMainFiles ?? [];
const sharedBytes = shared.reduce((s, f) => s + gz(f), 0);

// Every chunk the app ships, so a big file cannot hide by belonging to no route.
const chunkDir = join(DIST, "static", "chunks");
const walk = (dir, base = "") =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), `${base}${e.name}/`)
    : e.name.endsWith(".js") ? [`${base}${e.name}`] : []);
const all = walk(chunkDir).map((rel) => ({
  rel,
  raw: statSync(join(chunkDir, rel)).size,
  gzip: gzipSync(readFileSync(join(chunkDir, rel))).length,
}));

console.log(`\nshared by every page: ${kb(sharedBytes)}  (${shared.length} files)\n`);
console.log("largest chunks (gzipped)");
for (const c of all.sort((a, b) => b.gzip - a.gzip).slice(0, 12)) {
  console.log(`  ${kb(c.gzip)}  ${(c.raw / 1024).toFixed(0).padStart(5)} KB raw   ${c.rel}`);
}

const total = all.reduce((s, c) => s + c.gzip, 0);
console.log(`\n${all.length} chunks, ${kb(total)} gzipped in total`);
console.log("(total is every route added up — no one visitor downloads all of it)\n");
