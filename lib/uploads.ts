// ============================================================
// RASAMAP — image upload validation
//
// Images arrive as base64 data URLs from the browser (the listing wizard and
// the admin image manager). Everything a client tells us about a file is a
// claim, so nothing here trusts any of it:
//
//   - the declared MIME type is checked against the file's own magic bytes, so
//     a renamed executable, a PDF, an SVG (scriptable) or a polyglot cannot be
//     stored as "image/png";
//   - the extension is derived from the detected type, never from the client;
//   - the filename is generated here, so no client string ever reaches a path
//     (no traversal, no null bytes, no overwriting an existing file);
//   - size is capped after decoding, on the real byte count.
//
// What this does NOT do: virus scanning of image content. A genuinely valid
// JPEG can still carry a payload aimed at a specific decoder bug. The
// mitigation that matters for us is that uploads are served as static files
// from /uploads with X-Content-Type-Options: nosniff (set in proxy.ts) and are
// never executed, and that a listing stays unpublished until an admin has
// looked at it. See docs/engineering-decisions.md.
// ============================================================

import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB per image, after decoding
export const MAX_LISTING_IMAGES = 5;

const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/;

type ImageKind = "jpeg" | "png" | "webp";

const EXT: Record<ImageKind, string> = { jpeg: "jpg", png: "png", webp: "webp" };

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

export type DecodedImage = { buffer: Buffer; kind: ImageKind; ext: string };

export type DecodeResult =
  | { ok: true; image: DecodedImage }
  | { ok: false; error: string };

/**
 * Turn one `data:image/...;base64,...` string into bytes we are willing to
 * write, or a Persian reason why we are not.
 */
export function decodeImageDataUrl(src: string, index: number): DecodeResult {
  const position = (index + 1).toLocaleString("fa-IR");

  const match = DATA_URL_RE.exec(src.trim());
  if (!match) {
    return { ok: false, error: `تصویر ${position}: فقط فرمت JPG، PNG یا WEBP پذیرفته می‌شود.` };
  }

  const declared = match[1] as ImageKind;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], "base64");
  } catch {
    return { ok: false, error: `تصویر ${position}: فایل خوانده نشد.` };
  }

  if (buffer.length === 0) {
    return { ok: false, error: `تصویر ${position}: فایل خالی است.` };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: `تصویر ${position}: حجم باید کمتر از ۲ مگابایت باشد.` };
  }

  // The decisive check: what the bytes actually are.
  const kind = sniff(buffer);
  if (!kind) {
    return { ok: false, error: `تصویر ${position}: این فایل یک تصویر معتبر نیست.` };
  }
  if (kind !== declared) {
    // Declared one type, contains another — always a crafted file, never a
    // mistake a real photo picker makes.
    return { ok: false, error: `تصویر ${position}: نوع فایل با محتوای آن هم‌خوانی ندارد.` };
  }

  return { ok: true, image: { buffer, kind, ext: EXT[kind] } };
}

export type SaveResult =
  | { ok: true; urls: string[]; dir: string }
  | { ok: false; error: string };

/**
 * Validate and write a batch of data-URL images under `public/uploads/<scope>`.
 *
 * The folder name is a random UUID rather than the record id: the files are
 * served statically, so an unguessable path keeps a not-yet-approved listing's
 * photos from being enumerated. Returns public URLs in the input order.
 */
export async function saveImages(scope: string, sources: string[]): Promise<SaveResult> {
  if (sources.length === 0) return { ok: true, urls: [], dir: "" };
  if (sources.length > MAX_LISTING_IMAGES) {
    return { ok: false, error: `حداکثر ${MAX_LISTING_IMAGES.toLocaleString("fa-IR")} تصویر مجاز است.` };
  }

  // Decode and validate everything before touching the disk, so a bad image in
  // the batch leaves nothing half-written.
  const decoded: DecodedImage[] = [];
  for (let i = 0; i < sources.length; i++) {
    const result = decodeImageDataUrl(sources[i], i);
    if (!result.ok) return { ok: false, error: result.error };
    decoded.push(result.image);
  }

  const folder = randomUUID();
  const dir = join(process.cwd(), "public", "uploads", scope, folder);

  try {
    await mkdir(dir, { recursive: true });
    const urls: string[] = [];
    for (let i = 0; i < decoded.length; i++) {
      const name = `${i + 1}.${decoded[i].ext}`;
      await writeFile(join(dir, name), decoded[i].buffer);
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
