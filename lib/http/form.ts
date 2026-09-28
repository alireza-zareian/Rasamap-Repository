import { z, type ZodTypeAny } from "zod";

/**
 * Schemas for a multipart body (defineRoute's `form`), where every field is a
 * string or a File and a repeated field arrives as an array.
 */

/** A field sent zero to `max` times: one value arrives bare, several as an array; both read as an array. */
export function many<T extends ZodTypeAny>(item: T, max: number, tooMany: string) {
  return z.preprocess(
    v => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
    z.array(item).max(max, tooMany),
  );
}

/** An uploaded file; lib/uploads.ts checks its bytes. */
export const UploadedFile = z.instanceof(File, { message: "فایل ارسال‌شده معتبر نیست" });
