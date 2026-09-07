#!/usr/bin/env node
// Walks the public pages, pulls every image the HTML asks for — src and every
// srcset candidate — and checks each one actually resolves. Prints the weight
// a visitor downloads per page.
//
// This is the safety net for any change to how images are referenced: a broken
// path is invisible in a build and obvious here.
//
//   node scripts/check-images.mjs [baseUrl]

const BASE = process.argv[2] ?? "http://localhost:3000";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36";

const PAGES = [
  ["/", "landing"],
  ["/explore", "catalogue — grid"],
  ["/explore?view=list", "catalogue — list"],
  ["/billboard/scraped-bih-dd399113", "media detail"],
];

const kb = (n) => `${Math.round(n / 1024)} KB`;

// Two devices worth reporting: the phone a reviewer scans the QR code with, and
// the laptop the demo runs on.
const DEVICES = [
  { label: "phone  390px @2x", viewport: 390, dpr: 2 },
  { label: "laptop 1440px @1x", viewport: 1440, dpr: 1 },
];

/** The CSS pixel width a `sizes` string resolves to on a given viewport. */
function slotWidth(sizes, viewport) {
  if (!sizes) return viewport;
  for (const clause of sizes.split(",").map((c) => c.trim())) {
    const m = clause.match(/^(?:\(([^)]*)\)\s+)?(.+)$/);
    if (!m) continue;
    const [, condition, value] = m;
    if (condition) {
      const max = condition.match(/max-width:\s*(\d+)px/);
      const min = condition.match(/min-width:\s*(\d+)px/);
      if (max && viewport > Number(max[1])) continue;
      if (min && viewport < Number(min[1])) continue;
    }
    const vw = value.match(/([\d.]+)vw/);
    if (vw) return (viewport * Number(vw[1])) / 100;
    const px = value.match(/([\d.]+)px/);
    if (px) return Number(px[1]);
  }
  return viewport;
}

/** Which srcset candidate a browser picks — the narrowest that still covers
 *  the slot at this pixel density, or the widest available if none does. */
function pick(tag, viewport, dpr) {
  const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
  const srcset = tag.match(/\bsrcset="([^"]+)"/i)?.[1];
  if (!srcset) return src;
  const candidates = srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/))
    .map(([url, w]) => ({ url, w: parseInt(w, 10) }))
    .filter((c) => c.url && Number.isFinite(c.w))
    .sort((a, b) => a.w - b.w);
  if (!candidates.length) return src;
  const needed = slotWidth(tag.match(/\bsizes="([^"]+)"/i)?.[1], viewport) * dpr;
  return (candidates.find((c) => c.w >= needed) ?? candidates.at(-1)).url;
}

/** Every URL an <img> in this HTML can pull: its src plus each srcset candidate. */
function imageUrls(html) {
  const urls = new Set();
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
    if (src) urls.add(src);
    const srcset = tag.match(/\bsrcset="([^"]+)"/i)?.[1];
    if (srcset) {
      for (const part of srcset.split(",")) {
        const u = part.trim().split(/\s+/)[0];
        if (u) urls.add(u);
      }
    }
  }
  // Data and blob URLs are inline previews, not fetches.
  return [...urls].filter((u) => !u.startsWith("data:") && !u.startsWith("blob:"));
}

/** What one visitor on a given device actually downloads, once per file. */
function chosenUrls(html, viewport, dpr) {
  const urls = new Set();
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const u = pick(m[0], viewport, dpr);
    if (u && !u.startsWith("data:") && !u.startsWith("blob:")) urls.add(u);
  }
  return [...urls];
}

let broken = 0;

for (const [path, label] of PAGES) {
  const res = await fetch(BASE + path, { headers: { "user-agent": UA } });
  if (!res.ok) { console.log(`✗ ${label} — page returned ${res.status}`); broken++; continue; }
  const html = await res.text();

  const all = imageUrls(html);

  const size = new Map();
  const misses = [];
  for (const u of all) {
    const r = await fetch(new URL(u, BASE), { headers: { "user-agent": UA, referer: BASE + path } });
    if (!r.ok) { misses.push(`${u} → ${r.status}`); continue; }
    size.set(u, Number(r.headers.get("content-length") ?? (await r.arrayBuffer()).byteLength));
  }

  const weights = DEVICES.map((d) => {
    const chosen = chosenUrls(html, d.viewport, d.dpr);
    return { ...d, count: chosen.length, bytes: chosen.reduce((n, u) => n + (size.get(u) ?? 0), 0) };
  });

  // An image is safe from layout shift if it states its own box (width+height)
  // or fills a parent that already reserves one (next/image's `fill`).
  const tags = html.match(/<img\b[^>]*>/g) ?? [];
  const reserved = tags.filter(
    (t) => /\bwidth="/.test(t) || /data-nimg="fill"/.test(t),
  ).length;
  console.log(
    `${misses.length ? "✗" : "✓"} ${label.padEnd(22)} ` +
    weights.map((w) => `${w.label} ${kb(w.bytes).padStart(8)}`).join("   ") +
    `   ${reserved}/${tags.length} reserve their space`
  );
  for (const m of misses) { console.log(`      BROKEN: ${m}`); broken++; }
}

if (broken) { console.error(`\n${broken} broken image reference(s).`); process.exit(1); }
console.log("\nEvery image referenced by every page resolves.");
