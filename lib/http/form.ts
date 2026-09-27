import { z, type ZodTypeAny } from "zod";

/**
 * Schemas for a multipart body (defineRoute's `form`), where every field is a
 * string or a File and a repeated field arrives as an array.
 */

/**
 * A field that may be sent any number of times, from zero to `max`. A single
 * value arrives bare and several arrive as an array, so both are read as an
 * array here.
 */
export function many<T extends ZodTypeAny>(item: T, max: number, tooMany: string) {
  return z.preprocess(
    v => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
    z.array(item).max(max, tooMany),
  );
}

/** An uploaded file. What it contains is checked in lib/uploads.ts, by its bytes. */
export const UploadedFile = z.instanceof(File, { message: "فایل ارسال‌شده معتبر نیست" });
