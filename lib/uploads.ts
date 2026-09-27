// ============================================================
// RASAMAP — uploaded photos: validation, storage and serving
//
// Photos arrive as files in a multipart form (the listing wizard, a
// resubmission, the admin image manager). Everything a client says about a
// file is a claim, so nothing here trusts any of it:
//
//   - the type is read from the file's own first bytes, so a renamed
//     executable, a PDF, an SVG (scriptable) or a polyglot is refused whatever
//     it was called or declared as;
//   - the extension is derived from the detected type, never from the client;
//   - the file name is generated here, so no client string ever reaches a path
//     (no traversal, no null bytes, no overwriting an existing file);
//   - size is capped on the real byte count.
//
// What this does NOT do: scan image content. A genuinely valid JPEG can still
// carry a payload aimed at a specific decoder bug. What limits that here is
// that photos are only ever served back as images with nosniff, never
// executed, and that a listing stays unpublished until an admin has looked.
//
// Where they live: UPLOAD_DIR, by default storage/uploads — outside public/.
// Under public/ they were part of the build's static folder: `next start` lists
// that folder once at boot, so a photo written later answered 404 until a
// restart, and every upload was also mixed into the source tree. They are
// served by app/uploads/[...path]/route.ts at the same /uploads/... addresses
// as before; photos written under public/uploads by an earlier version are
// still read from there.
// ============================================================

import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm, readFile, readdir, rmdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { faNum } from "@/lib/format";
import { MAX_IMAGE_BYTES, MAX_LISTING_IMAGES } from "@/lib/domain/listing";

/** Where new uploads are written. */
const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR || join(process.cwd(), "storage", "uploads"));
/** Where uploads were written before they left public/ — read and cleaned, never written. */
const LEGACY_ROOT = resolve(process.cwd(), "public", "uploads");

type ImageKind = "jpeg" | "png" | "webp";

const EXT: Record<ImageKind, string> = { jpeg: "jpg", png: "png", webp: "webp" };
const CONTENT_TYPE: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Identify a buffer by its own header, ignoring whatever the client claimed. */
function sniff(buf: Buffer): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "png";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) return "webp";
  return null;
}

type Checked = { ok: true; buffer: Buffer; ext: string } | { ok: false; error: string };

/** One uploaded file, as bytes we are willing to write, or a Persian reason why not. */
async function checkImage(file: File, index: number): Promise<Checked> {
  const position = faNum(index + 1);
  if (file.size === 0) return { ok: false, error: `تصویر ${position}: فایل خالی است.` };
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: `تصویر ${position}: حجم باید کمتر از ${faNum(MAX_IMAGE_BYTES / 1024 / 1024)} مگابایت باشد.` };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buffer);
  if (!kind) return { ok: false, error: `تصویر ${position}: فقط تصویر JPG، PNG یا WEBP پذیرفته می‌شود.` };
  return { ok: true, buffer, ext: EXT[kind] };
}

export type SaveResult =
  | { ok: true; urls: string[]; dir: string }
  | { ok: false; error: string };

/**
 * Validate and write a batch of photos under `<UPLOAD_ROOT>/<scope>/<uuid>/`.
 *
 * Every file is checked before any is written, so a bad photo in the batch
 * leaves nothing half-written. The folder name is a random UUID rather than
 * the record id, so a not-yet-approved listing's photos cannot be enumerated.
 * Returns public URLs in the input order.
 */
export async function saveImages(scope: string, files: File[], max: number = MAX_LISTING_IMAGES): Promise<SaveResult> {
  if (files.length === 0) return { ok: true, urls: [], dir: "" };
  if (files.length > max) return { ok: false, error: `حداکثر ${faNum(max)} تصویر مجاز است.` };

  const checked: { buffer: Buffer; ext: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const result = await checkImage(files[i], i);
    if (!result.ok) return result;
    checked.push(result);
  }

  const folder = randomUUID();
  const dir = join(UPLOAD_ROOT, scope, folder);
  try {
    await mkdir(dir, { recursive: true });
    const urls: string[] = [];
    for (let i = 0; i < checked.length; i++) {
      const name = `${i + 1}.${checked[i].ext}`;
      await writeFile(join(dir, name), checked[i].buffer);
      urls.push(`/uploads/${scope}/${folder}/${name}`);
    }
    return { ok: true, urls, dir };
  } catch {
    await discardImages(dir);
    return { ok: false, error: "ذخیره تصاویر ناموفق بود. دوباره تلاش کنید." };
  }
}

/** Remove a folder written by saveImages — used when the DB write then fails. */
export async function discardImages(dir: string): Promise<void> {
  if (!dir) return;
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    /* best effort: an orphaned folder is harmless, a thrown error here is not */
  }
}

/** The file an /uploads/... address names under `root`, or null if it would leave it. */
function inside(root: string, segments: string[]): string | null {
  const full = resolve(root, ...segments);
  return full.startsWith(root + sep) ? full : null;
}

/**
 * An uploaded photo, for app/uploads/[...path]/route.ts, or null. Only one of
 * the three image types saveImages() writes, and only from inside an upload
 * root.
 */
export async function readUpload(segments: string[]): Promise<{ body: Buffer; contentType: string } | null> {
  for (const root of [UPLOAD_ROOT, LEGACY_ROOT]) {
    const full = inside(root, segments);
    if (!full) return null;
    const contentType = CONTENT_TYPE[full.slice(full.lastIndexOf(".") + 1).toLowerCase()];
    if (!contentType) return null;
    try {
      return { body: await readFile(full), contentType };
    } catch {
      // Not in this root; try the next.
    }
  }
  return null;
}

/**
 * Delete uploaded photos no record points to any more — the ones a
 * resubmission, a photo replacement or a deletion just dropped. They used to
 * stay on disk for ever, and stayed reachable by URL.
 *
 * Only /uploads/ addresses are touched; the crawled catalogue under /images/
 * is never an upload. Every upload lives in a folder of its own batch, so no
 * other record can share the file; the folder goes too once it is empty. Best
 * effort, like discardImages: a file left behind costs disk space, a thrown
 * error here would cost the write that already succeeded.
 */
export async function discardUploads(urls: string[]): Promise<void> {
  for (const url of urls) {
    if (!url.startsWith("/uploads/")) continue;
    const segments = url.slice("/uploads/".length).split("/");
    for (const root of [UPLOAD_ROOT, LEGACY_ROOT]) {
      const full = inside(root, segments);
      if (!full) continue;
      try {
        await rm(full, { force: true });
        const folder = dirname(full);
        if (folder !== root && (await readdir(folder)).length === 0) await rmdir(folder);
      } catch {
        /* best effort — see above */
      }
    }
  }
}
