import { z } from "zod";

/**
 * The one password rule, for customers and staff alike.
 *
 * Customers were allowed six characters and staff eight, in five separate
 * schemas. Eight is the floor NIST SP 800-63B sets for a password a person
 * chooses; the upper bound keeps bcrypt (which reads only the first 72 bytes)
 * from being handed a megabyte to hash.
 *
 * Applies to a password being *set*. Signing in accepts any length, so an
 * account made under the old six-character rule can still get in and change it.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const PASSWORD_TOO_SHORT = `رمز عبور باید حداقل ${MIN_PASSWORD_LENGTH.toLocaleString("fa-IR")} نویسه باشد`;

export const NewPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT)
  .max(MAX_PASSWORD_LENGTH, "رمز عبور بیش از حد طولانی است");
