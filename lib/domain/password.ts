import { z } from "zod";
import { latinDigits } from "./digits.ts";

/**
 * The one rule for a password being set, customers and staff alike: eight is
 * NIST SP 800-63B's floor; the ceiling keeps a megabyte away from bcrypt, which
 * reads only 72 bytes anyway.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const PASSWORD_TOO_SHORT = `رمز عبور باید حداقل ${MIN_PASSWORD_LENGTH.toLocaleString("fa-IR")} نویسه باشد`;

export const NewPassword = z
  .string()
  .transform(latinDigits)
  .pipe(z.string()
    .min(MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT)
    .max(MAX_PASSWORD_LENGTH, "رمز عبور بیش از حد طولانی است"));

/**
 * A password being checked: any length, so an account made under the older
 * six-character rule still signs in. Same digit conversion as NewPassword.
 */
export const GivenPassword = z.string().min(1).max(MAX_PASSWORD_LENGTH).transform(latinDigits);
