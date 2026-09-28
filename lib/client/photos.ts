import { MAX_IMAGE_BYTES } from "@/lib/domain/listing";

/**
 * Photos redrawn in the browser before upload: at most MAX_EDGE pixels on the
 * long side, as JPEG. A 3–8 MB camera photo becomes a few hundred KB, under the
 * server's 2 MB. The canvas carries no EXIF, so GPS, camera and time stay on
 * the phone; orientation is applied while decoding. The server still checks
 * every file itself (lib/uploads.ts).
 */

const MAX_EDGE = 1600;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export const PHOTO_TYPE_ERROR = "فقط فرمت JPG، PNG یا WEBP پذیرفته می‌شود.";
const UNREADABLE = "این تصویر خوانده نشد. تصویر دیگری انتخاب کنید.";

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** One picked photo, ready to upload, or a Persian reason why it cannot be. */
export async function preparePhoto(file: File): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  if (!ACCEPTED.includes(file.type)) return { ok: false, error: PHOTO_TYPE_ERROR };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, error: UNREADABLE };
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, error: UNREADABLE };
  // JPEG has no transparency; a transparent PNG would otherwise turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Lower quality only for a picture too detailed to fit at 0.85.
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_IMAGE_BYTES) {
      return { ok: true, file: new File([blob], "photo.jpg", { type: "image/jpeg" }) };
    }
  }
  return { ok: false, error: UNREADABLE };
}

/**
 * The photos a picker produced, prepared, up to `room` of them. Returns the
 * ones that made it and the last reason one did not.
 */
export async function preparePhotos(files: File[], room: number): Promise<{ files: File[]; error: string }> {
  const prepared: File[] = [];
  let error = "";
  for (const file of files.slice(0, Math.max(0, room))) {
    const result = await preparePhoto(file);
    if (result.ok) prepared.push(result.file);
    else error = result.error;
  }
  return { files: prepared, error };
}

/**
 * A multipart body: every field as text, and `photos` once per entry, in
 * order — a file for a new photo, an address for one being kept. The server
 * reads the repeated field back in the same order (lib/http/form.ts).
 */
export function photoForm(fields: Record<string, string | number>, photos: (string | File)[]): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, String(value));
  for (const photo of photos) fd.append("photos", photo);
  return fd;
}
